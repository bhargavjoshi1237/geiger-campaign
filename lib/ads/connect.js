import { randomBytes } from "node:crypto";
import { ApiError, badRequest, notConfigured } from "@/lib/server/http";
import { isSigningConfigured, signToken, verifyToken } from "@/lib/server/tokens";
import { upsertAdAccounts } from "./accounts";
import {
  actId,
  adAccountRowFromGraph,
  exchangeCodeForToken,
  getAdAccount,
  grantedScopes,
  graphErrorMessage,
  isMetaAppConfigured,
  listManagedPages,
  listUserAdAccounts,
  oauthDialogUrl,
} from "./meta_ads";

// Connecting Meta ad accounts (server-only): Facebook Login with the ads scopes (signed, 30-minute state),
// or a Business Manager system-user token pasted by an admin. Tokens land in ad_account_secrets only.

const STATE_KIND = "ads_oauth";

export function startAdsOAuth({ projectId, userId, redirectUri }) {
  if (!isMetaAppConfigured()) throw notConfigured("Meta login isn't configured (META_APP_ID / META_APP_SECRET).");
  if (!isSigningConfigured()) throw notConfigured("CAMPAIGN_SIGNING_SECRET isn't configured.");
  const state = signToken({ k: STATE_KIND, pid: projectId, uid: userId, n: randomBytes(8).toString("hex") }, { ttlDays: 30 / (24 * 60) });
  return oauthDialogUrl({ redirectUri, state });
}

export function readAdsOAuthState(token) {
  const payload = verifyToken(token, STATE_KIND);
  return payload ? { projectId: payload.pid, userId: payload.uid } : null;
}

// One account connects straight away; several land as "pending" for the user to choose on Ad Campaigns.
export async function completeAdsOAuth(db, { projectId, userId, code, redirectUri }) {
  const token = await exchangeCodeForToken({ code, redirectUri });
  if (!token.ok) return { ok: false, error: token.error || "Meta didn't issue a token." };
  const [accounts, pages, scopes] = await Promise.all([
    listUserAdAccounts(token.accessToken),
    listManagedPages(token.accessToken),
    grantedScopes(token.accessToken),
  ]);
  if (!accounts.ok) return { ok: false, error: graphErrorMessage(accounts, "Couldn't list your ad accounts.") };
  if (!accounts.rows.length) return { ok: false, error: "This Facebook user has no ad accounts." };
  const { data: existing } = await db.from("ad_accounts").select("external_id, status").eq("project_id", projectId).is("deleted_at", null);
  const connectedBefore = new Set((existing || []).filter((a) => a.status === "connected").map((a) => a.external_id));
  const single = accounts.rows.length === 1;
  const rows = accounts.rows.map((graph) => {
    const row = adAccountRowFromGraph(graph, { projectId, pages: pages.pages, tokenKind: "oauth", scopes, expiresAt: token.expiresAt, createdBy: userId });
    return { ...row, status: single || connectedBefore.has(row.external_id) ? "connected" : "pending" };
  });
  const saved = await upsertAdAccounts(db, rows, { accessToken: token.accessToken, pageTokens: pages.tokens });
  return { ok: true, connected: saved.filter((a) => a.status === "connected").length, pending: saved.filter((a) => a.status === "pending").length };
}

// Validates a pasted system-user token against the ad account, then stores it with the pages it manages.
export async function connectWithToken(db, { projectId, userId, accessToken, adAccountId }) {
  const external = actId(adAccountId);
  if (!external) throw badRequest("Enter the ad account id, e.g. act_1234567890.");
  const token = String(accessToken || "").trim();
  if (token.length < 20) throw badRequest("Paste the full access token.");
  const account = await getAdAccount(token, external);
  if (!account.ok) throw new ApiError(400, graphErrorMessage(account, "Meta didn't accept that token for this ad account."), "meta_rejected");
  const [pages, scopes] = await Promise.all([listManagedPages(token), grantedScopes(token)]);
  const row = adAccountRowFromGraph(account.data, { projectId, pages: pages.pages, tokenKind: "system_user", scopes, createdBy: userId });
  const [saved] = await upsertAdAccounts(db, [{ ...row, status: "connected" }], { accessToken: token, pageTokens: pages.tokens });
  if (!saved) throw new ApiError(500, "Couldn't save the ad account.", "save_failed");
  return saved;
}
