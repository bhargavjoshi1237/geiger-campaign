import { notFound, notConfigured, ApiError } from "@/lib/server/http";
import { fetchAccountTree, graphErrorMessage } from "./meta_ads";

// Ad account plumbing (server-only, service-role db): loading an account with its token, storing
// secrets, resolving page tokens and refreshing the Marketing API snapshots. Never leaks tokens to callers
// outside lib/ads.

export async function loadAdAccount(db, projectId, accountId) {
  const { data: account } = await db
    .from("ad_accounts")
    .select("*")
    .eq("project_id", projectId)
    .eq("id", accountId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!account) return { account: null, secrets: null };
  const { data: secretRow } = await db.from("ad_account_secrets").select("secrets").eq("ad_account_id", account.id).maybeSingle();
  return { account, secrets: secretRow?.secrets || {} };
}

// Same as loadAdAccount but throws the HTTP error a route should return.
export async function requireAdAccount(db, projectId, accountId) {
  const { account, secrets } = await loadAdAccount(db, projectId, accountId);
  if (!account) throw notFound("Ad account not found.");
  if (account.status !== "connected") throw new ApiError(409, "This ad account isn't connected.", "not_connected");
  if (!secrets?.accessToken) throw notConfigured("This ad account has no access token — reconnect it.");
  return { account, token: secrets.accessToken, secrets };
}

export async function listConnectedAccounts(db, projectId = null) {
  let query = db.from("ad_accounts").select("*").eq("status", "connected").is("deleted_at", null).order("created_at");
  if (projectId) query = query.eq("project_id", projectId);
  const { data } = await query.limit(500);
  return data || [];
}

export async function saveAdAccountSecrets(db, { projectId, accountId, secrets }) {
  const { data: existing } = await db.from("ad_account_secrets").select("secrets").eq("ad_account_id", accountId).maybeSingle();
  const merged = { ...(existing?.secrets || {}), ...(secrets || {}) };
  if (secrets?.pageTokens) merged.pageTokens = { ...(existing?.secrets?.pageTokens || {}), ...secrets.pageTokens };
  const { error } = await db
    .from("ad_account_secrets")
    .upsert({ project_id: projectId, ad_account_id: accountId, secrets: merged }, { onConflict: "ad_account_id" });
  if (error) {
    console.error("[ads.saveSecrets]", error.message);
    return false;
  }
  return true;
}

// Upserts ad_accounts rows (reviving soft-deleted ones) and stores the shared token + page tokens on each.
export async function upsertAdAccounts(db, rows, { accessToken, pageTokens = {}, status }) {
  const saved = [];
  for (const row of rows) {
    if (!row.external_id) continue;
    const payload = { ...row, ...(status ? { status } : {}), connected_at: new Date().toISOString() };
    const { data, error } = await db.from("ad_accounts").upsert(payload, { onConflict: "project_id,external_id" }).select("*").single();
    if (error) {
      console.error("[ads.upsertAccount]", error.message);
      continue;
    }
    await saveAdAccountSecrets(db, { projectId: data.project_id, accountId: data.id, secrets: { accessToken, pageTokens } });
    saved.push(data);
  }
  return saved;
}

// A page access token for `pageId`: the ad accounts' stored page tokens first, then the channel connection's secrets.
export async function resolvePageToken(db, projectId, pageId, connection = null) {
  if (pageId) {
    const { data: accounts } = await db
      .from("ad_accounts")
      .select("id, page_ids")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .contains("page_ids", [String(pageId)]);
    for (const account of accounts || []) {
      const { data } = await db.from("ad_account_secrets").select("secrets").eq("ad_account_id", account.id).maybeSingle();
      const token = data?.secrets?.pageTokens?.[String(pageId)];
      if (token) return token;
    }
  }
  let connectionId = connection?.id || null;
  if (!connectionId && pageId) {
    const { data } = await db
      .from("channel_connections")
      .select("id")
      .eq("project_id", projectId)
      .eq("external_id", String(pageId))
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    connectionId = data?.id || null;
  }
  if (!connectionId) return null;
  const { data: secretRow } = await db.from("channel_secrets").select("secrets").eq("connection_id", connectionId).maybeSingle();
  const s = secretRow?.secrets || {};
  return s.pageAccessToken || s.page_access_token || s.pageToken || s.accessToken || s.access_token || null;
}

// The page token able to act on an Instagram account (via the page it's linked to) or a Facebook page.
export async function resolveTokenForChannel(db, projectId, { channel, externalId, connection = null }) {
  if (channel === "instagram" && externalId) {
    const { data: accounts } = await db.from("ad_accounts").select("pages").eq("project_id", projectId).is("deleted_at", null);
    for (const account of accounts || []) {
      const page = (account.pages || []).find((p) => String(p.igUserId) === String(externalId));
      if (page) {
        const token = await resolvePageToken(db, projectId, page.id, null);
        if (token) return token;
      }
    }
    return resolvePageToken(db, projectId, null, connection);
  }
  return resolvePageToken(db, projectId, externalId, connection);
}

// Pulls the live account tree from the Marketing API into ad_campaign_snapshots; prunes entities Meta no longer returns.
export async function syncAccountSnapshots(db, account, token, { datePreset = "last_7d" } = {}) {
  const tree = await fetchAccountTree(token, account, { datePreset });
  const now = new Date().toISOString();
  if (!tree.ok) {
    const message = graphErrorMessage(tree, "Couldn't read the ad account.");
    await db.from("ad_accounts").update({ last_error: message, status: tree.status === 401 || tree.status === 403 ? "error" : account.status }).eq("id", account.id);
    return { ok: false, error: message };
  }
  for (let i = 0; i < tree.rows.length; i += 500) {
    const { error } = await db
      .from("ad_campaign_snapshots")
      .upsert(tree.rows.slice(i, i + 500), { onConflict: "ad_account_id,level,external_id" });
    if (error) {
      console.error("[ads.syncSnapshots]", error.message);
      return { ok: false, error: "Couldn't store the snapshots." };
    }
  }
  if (tree.complete) {
    await db
      .from("ad_campaign_snapshots")
      .update({ deleted_at: now })
      .eq("ad_account_id", account.id)
      .lt("captured_at", tree.capturedAt)
      .is("deleted_at", null);
  }
  await db.from("ad_accounts").update({ last_synced_at: now, last_error: null }).eq("id", account.id);
  return { ok: true, ...tree.counts, syncedAt: now };
}
