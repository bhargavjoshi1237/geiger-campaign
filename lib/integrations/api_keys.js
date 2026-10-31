import { badRequest, notFound } from "@/lib/server/http";
import { generateApiKey } from "@/lib/server/api_keys";
import { API_SCOPE_KEYS, EXPIRY_OPTIONS, PUBLIC_KEY_SCOPES } from "./scopes";

// API key lifecycle (server-only, admin db): issue, roll and revoke. The plaintext key is returned exactly
// once from issue/roll; only its sha256 is stored (campaign.api_key_secrets).

function expiryDate(value) {
  const option = EXPIRY_OPTIONS.find((o) => o.value === String(value ?? "never"));
  if (!option) throw badRequest("Pick an expiry of never, 30, 90 or 365 days.");
  return option.days ? new Date(Date.now() + option.days * 86_400_000).toISOString() : null;
}

async function loadKey(db, projectId, keyId) {
  const { data } = await db.from("api_keys").select("*").eq("id", keyId).eq("project_id", projectId).is("deleted_at", null).maybeSingle();
  if (!data) throw notFound("That API key doesn't exist.");
  return data;
}

export async function issueApiKey(db, projectId, input, userId) {
  const name = String(input?.name || "").trim().slice(0, 120);
  if (!name) throw badRequest("Give the key a name.");
  const kind = input?.kind === "public" ? "public" : "secret";
  const scopes = kind === "public" ? PUBLIC_KEY_SCOPES : [...new Set((input?.scopes || []).filter((s) => API_SCOPE_KEYS.includes(s)))];
  if (!scopes.length) throw badRequest("Choose at least one scope.");
  const expiresAt = expiryDate(input?.expiry);

  const { key, prefix, hash } = generateApiKey(kind);
  const { data: row, error } = await db
    .from("api_keys")
    .insert({ project_id: projectId, name, kind, prefix, display_key: kind === "public" ? key : null, scopes, expires_at: expiresAt, created_by: userId })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const { error: secretError } = await db.from("api_key_secrets").insert({ project_id: projectId, key_id: row.id, key_hash: hash });
  if (secretError) {
    await db.from("api_keys").delete().eq("id", row.id);
    throw new Error(secretError.message);
  }
  return { apiKey: row, key };
}

// New secret for the same key row; the old one stops working immediately.
export async function rollApiKey(db, projectId, keyId) {
  const existing = await loadKey(db, projectId, keyId);
  if (existing.revoked_at) throw badRequest("Revoked keys can't be rolled. Create a new key instead.");
  const { key, prefix, hash } = generateApiKey(existing.kind);
  const { error: secretError } = await db.from("api_key_secrets").upsert({ project_id: projectId, key_id: keyId, key_hash: hash }, { onConflict: "key_id" });
  if (secretError) throw new Error(secretError.message);
  const { data: row, error } = await db
    .from("api_keys")
    .update({ prefix, display_key: existing.kind === "public" ? key : null, last_used_at: null })
    .eq("id", keyId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return { apiKey: row, key };
}

export async function revokeApiKey(db, projectId, keyId) {
  const existing = await loadKey(db, projectId, keyId);
  if (existing.revoked_at) return { apiKey: existing };
  const { data: row, error } = await db.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", keyId).select("*").single();
  if (error) throw new Error(error.message);
  return { apiKey: row };
}
