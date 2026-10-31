import { createHmac, timingSafeEqual } from "node:crypto";
import { extractApiKey, verifyApiKey } from "@/lib/server/api_keys";
import { ApiError, unauthorized } from "@/lib/server/http";
import { loadConnection } from "@/lib/messaging/connections";

// Browser SDK auth for in-app and web push (server-only). The project comes from a public key (gcp_…);
// the user is proven with identity verification: your server computes
//   user_hash = HMAC-SHA256(identity secret, user)   (hex; user = lower-cased email or contact id)
// and hands it to the page, so nobody can read another contact's messages with the public key alone.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const normalizeSdkUser = (user) => {
  const value = String(user || "").trim();
  return value.includes("@") ? value.toLowerCase() : value;
};

export function userHash(secret, user) {
  return createHmac("sha256", secret).update(normalizeSdkUser(user)).digest("hex");
}

export function verifyUserHash(secret, user, hash) {
  if (!secret || !user || !hash) return false;
  const expected = Buffer.from(userHash(secret, user));
  const actual = Buffer.from(String(hash).toLowerCase());
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// { projectId } for the public key on the request (header, ?key= or body.key).
export async function resolveSdkProject(db, request, body = null) {
  const url = new URL(request.url);
  const key = extractApiKey(request) || url.searchParams.get("key") || body?.key || null;
  if (!key) throw unauthorized("Pass your Geiger public key.");
  const verified = await verifyApiKey(db, key, {});
  if (!verified?.projectId) throw unauthorized("That Geiger key isn't valid.");
  return { projectId: verified.projectId, keyId: verified.keyId || null };
}

// The verified contact for { user, hash }; throws 401 on a bad hash, 404 when the contact is unknown.
export async function resolveSdkContact(db, projectId, { user, hash }) {
  const { connection, secrets } = await loadConnection(db, projectId, "in_app");
  if (!connection || connection.status !== "connected") throw new ApiError(403, "In-app messaging isn't enabled for this project.", "not_enabled");
  if (!verifyUserHash(secrets?.identitySecret, user, hash)) throw unauthorized("The user hash doesn't match.");
  const value = normalizeSdkUser(user);
  let query = db.from("contacts").select("id, email").eq("project_id", projectId).is("deleted_at", null);
  query = UUID.test(value) ? query.eq("id", value) : query.ilike("email", value);
  const { data } = await query.limit(1).maybeSingle();
  if (!data) throw new ApiError(404, "No contact matches that user.", "not_found");
  return { contact: data, connection };
}
