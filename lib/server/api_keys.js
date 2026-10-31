import { adminClient } from "@/lib/supabase/admin";
import { ApiError, notConfigured, unauthorized } from "@/lib/server/http";
import { randomBase62, sha256Hex } from "@/lib/integrations/secrets";
import { PUBLIC_KEY_SCOPES } from "@/lib/integrations/scopes";

// Developer API keys (server-only): verify `Authorization: Bearer gck_…` / `x-api-key` against the
// hashed keys in campaign.api_key_secrets. Public write keys (for the JS snippet / embeds) are prefixed gcp_
// and only allow ingest scopes. verifyApiKey returns { projectId, keyId, scopes, kind } or null.

const SECRET_PREFIX = "gck_live_";
const PUBLIC_PREFIX = "gcp_";
const KEY_FORMAT = /^(gck_live_|gcp_)[0-9A-Za-z]{32}$/;
const TOUCH_EVERY_MS = 60_000;

export function extractApiKey(request) {
  const header = request.headers.get("authorization") || "";
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  return request.headers.get("x-api-key") || request.headers.get("x-geiger-key") || null;
}

export function kindOfKey(key) {
  if (typeof key !== "string") return null;
  if (key.startsWith(SECRET_PREFIX)) return "secret";
  if (key.startsWith(PUBLIC_PREFIX)) return "public";
  return null;
}

// A fresh key: the plaintext (shown once), its displayable prefix and the stored hash.
export function generateApiKey(kind = "secret") {
  const key = `${kind === "public" ? PUBLIC_PREFIX : SECRET_PREFIX}${randomBase62(32)}`;
  return { key, prefix: key.slice(0, 12), hash: sha256Hex(key) };
}

export async function verifyApiKey(db, key, { scope } = {}) {
  if (!db || typeof key !== "string" || !KEY_FORMAT.test(key)) return null;
  try {
    const { data: secret, error: secretError } = await db
      .from("api_key_secrets")
      .select("key_id")
      .eq("key_hash", sha256Hex(key))
      .maybeSingle();
    if (secretError || !secret) return null;

    const { data: row, error } = await db
      .from("api_keys")
      .select("id, project_id, kind, scopes, expires_at, revoked_at, deleted_at, last_used_at")
      .eq("id", secret.key_id)
      .maybeSingle();
    if (error || !row || row.revoked_at || row.deleted_at) return null;
    if (row.kind !== kindOfKey(key)) return null;
    if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) return null;

    const scopes = Array.isArray(row.scopes) ? row.scopes : [];
    const allowed = row.kind === "public" ? scopes.filter((s) => PUBLIC_KEY_SCOPES.includes(s)) : scopes;
    if (scope && !allowed.includes(scope)) return null;

    if (!row.last_used_at || Date.now() - Date.parse(row.last_used_at) > TOUCH_EVERY_MS) {
      await db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);
    }
    return { projectId: row.project_id, keyId: row.id, scopes: allowed, kind: row.kind };
  } catch (e) {
    console.error("[api_keys.verify]", e);
    return null;
  }
}

// Route guard for /api/v1 and public ingest: the admin db plus the verified key, or a 401/403/503.
export async function authenticateApiKey(request, { scope, key: explicitKey = null, kinds = ["secret"] } = {}) {
  const db = adminClient();
  if (!db) throw notConfigured("The API isn't configured on this deployment (SUPABASE_SERVICE_ROLE_KEY is missing).");
  const key = explicitKey || extractApiKey(request);
  if (!key) throw unauthorized("Pass an API key as `Authorization: Bearer <key>`.");
  const kind = kindOfKey(key);
  if (!kind || !kinds.includes(kind)) {
    throw new ApiError(401, kind === "public" ? "Public keys can only send tracking events. Use a secret key." : "That isn't a valid API key.", "invalid_key");
  }
  const verified = await verifyApiKey(db, key, { scope });
  if (!verified) {
    const unscoped = scope ? await verifyApiKey(db, key) : null;
    if (unscoped) throw new ApiError(403, `This key doesn't have the ${scope} scope.`, "missing_scope");
    throw new ApiError(401, "This API key is invalid, expired or revoked.", "invalid_key");
  }
  return { db, ...verified };
}
