import { saveConnectionSecrets } from "@/lib/messaging/connections";
import { defaultSettings } from "./catalog";

// Server-side writes to campaign.channel_connections for the social connect flows (service-role db; callers
// authorize campaign.channel.manage first). One row per provider account: (provider, external_id) is unique
// across projects, so a re-auth updates the existing row and an account owned by another project is refused.

export async function loadProjectConnection(db, projectId, connectionId) {
  const { data: connection, error } = await db
    .from("channel_connections")
    .select("*")
    .eq("id", connectionId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) console.error("[social.store.load]", error.message);
  if (!connection) return { connection: null, secrets: null };
  const { data: secretRow } = await db.from("channel_secrets").select("secrets").eq("connection_id", connection.id).maybeSingle();
  return { connection, secrets: secretRow?.secrets || {} };
}

export async function listProjectConnections(db, projectId, channels) {
  let query = db.from("channel_connections").select("*").eq("project_id", projectId).is("deleted_at", null);
  if (channels?.length) query = query.in("channel", channels);
  const { data, error } = await query.order("created_at");
  if (error) console.error("[social.store.list]", error.message);
  return data || [];
}

// Creates or refreshes the connection for one provider account, then stores its credentials.
// Returns { ok, connection, created, error }.
export async function upsertSocialConnection(
  db,
  { projectId, userId, channel, provider, externalId, name, handle = "", config = {}, status = "connected", secrets = null },
) {
  const now = new Date().toISOString();
  const { data: existing, error: lookupError } = await db
    .from("channel_connections")
    .select("*")
    .eq("provider", provider)
    .eq("external_id", String(externalId))
    .is("deleted_at", null)
    .maybeSingle();
  if (lookupError) {
    console.error("[social.store.upsert]", lookupError.message);
    return { ok: false, error: "Couldn't check existing connections." };
  }
  if (existing && existing.project_id !== projectId) {
    return { ok: false, error: `${name || externalId} is already connected to another project. Disconnect it there first.` };
  }

  let row;
  if (existing) {
    const prev = existing.config && typeof existing.config === "object" ? existing.config : {};
    const { data, error } = await db
      .from("channel_connections")
      .update({
        name,
        display_handle: handle,
        status,
        // Keep operator-edited settings and brand across re-auth.
        config: { ...prev, ...config, settings: prev.settings || defaultSettings(channel), brand: prev.brand || config.brand || name },
        connected_at: existing.connected_at || now,
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) {
      console.error("[social.store.upsert]", error.message);
      return { ok: false, error: "Couldn't update the connection." };
    }
    row = data;
  } else {
    const { data, error } = await db
      .from("channel_connections")
      .insert({
        project_id: projectId,
        channel,
        provider,
        name,
        external_id: String(externalId),
        display_handle: handle,
        status,
        config: { brand: config.brand || name, ...config, settings: defaultSettings(channel) },
        health: {},
        connected_at: now,
        created_by: userId || null,
      })
      .select("*")
      .single();
    if (error) {
      console.error("[social.store.upsert]", error.message);
      return { ok: false, error: "Couldn't save the connection." };
    }
    row = data;
  }

  if (secrets) {
    const saved = await saveConnectionSecrets(db, { projectId, connectionId: row.id, secrets });
    if (!saved) return { ok: false, connection: row, error: "Connected, but the credentials couldn't be stored." };
  }
  return { ok: true, connection: row, created: !existing, error: null };
}

export async function saveHealth(db, connectionId, { status, health, config }) {
  const patch = { health, last_checked_at: new Date().toISOString() };
  if (status) patch.status = status;
  if (config) patch.config = config;
  const { data, error } = await db.from("channel_connections").update(patch).eq("id", connectionId).select("*").single();
  if (error) {
    console.error("[social.store.health]", error.message);
    return null;
  }
  return data;
}

// Deep-merges a patch into one key of the connection's health bag (webhooks write sync results here).
export async function mergeHealth(db, connection, patch) {
  const health = { ...(connection.health || {}), ...patch };
  const { error } = await db.from("channel_connections").update({ health }).eq("id", connection.id);
  if (error) console.error("[social.store.mergeHealth]", error.message);
  return health;
}
