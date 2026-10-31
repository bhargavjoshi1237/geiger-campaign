// Channel connection lookup for providers (server-only, service-role db). A send names a connection,
// or falls back to the project's first connected account for the channel. Secrets are read separately
// from campaign.channel_secrets, which no client can select.

export async function loadConnection(db, projectId, channel, connectionId = null) {
  let query = db
    .from("channel_connections")
    .select("*")
    .eq("project_id", projectId)
    .eq("channel", channel)
    .is("deleted_at", null);
  query = connectionId ? query.eq("id", connectionId) : query.eq("status", "connected").order("created_at");
  const { data: connection } = await query.limit(1).maybeSingle();
  if (!connection) return { connection: null, secrets: null };

  const { data: secretRow } = await db
    .from("channel_secrets")
    .select("secrets")
    .eq("connection_id", connection.id)
    .maybeSingle();
  return { connection, secrets: secretRow?.secrets || {} };
}

// Stores (merges) a connection's credentials. Callers authorize campaign.channel.manage first.
export async function saveConnectionSecrets(db, { projectId, connectionId, secrets }) {
  const { data: existing } = await db
    .from("channel_secrets")
    .select("secrets")
    .eq("connection_id", connectionId)
    .maybeSingle();
  const merged = { ...(existing?.secrets || {}), ...(secrets || {}) };
  const { error } = await db
    .from("channel_secrets")
    .upsert({ project_id: projectId, connection_id: connectionId, secrets: merged }, { onConflict: "connection_id" });
  if (error) {
    console.error("[messaging.saveConnectionSecrets]", error.message);
    return false;
  }
  return true;
}

export function notConnected(label) {
  return { status: "not_sent", error: `${label} isn't connected.` };
}
