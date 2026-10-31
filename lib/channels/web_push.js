import { createCipheriv, createECDH, createPrivateKey, generateKeyPairSync, hkdfSync, randomBytes, sign } from "node:crypto";

// Web Push without a third-party service (server-only, node:crypto): VAPID application-server auth
// (RFC 8292, ES256 JWT) and aes128gcm payload encryption (RFC 8291 / RFC 8188), POSTed straight to the
// browser's push service endpoint. Returns { ok, status, gone, messageId, error } — never throws.

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const fromB64u = (s) => Buffer.from(String(s || ""), "base64url");

// A fresh P-256 VAPID key pair: public = 65-byte uncompressed point, private = 32-byte scalar (base64url).
export function generateVapidKeys() {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = privateKey.export({ format: "jwk" });
  const publicKey = Buffer.concat([Buffer.from([0x04]), fromB64u(jwk.x), fromB64u(jwk.y)]);
  return { publicKey: b64u(publicKey), privateKey: jwk.d };
}

function vapidKeyObject(publicKey, privateKey) {
  const pub = fromB64u(publicKey);
  if (pub.length !== 65 || pub[0] !== 0x04) throw new Error("Invalid VAPID public key.");
  return createPrivateKey({
    key: { kty: "EC", crv: "P-256", d: privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: "jwk",
  });
}

// `vapid t=<jwt>, k=<public key>` for one push service origin.
export function vapidAuthorization({ endpoint, publicKey, privateKey, subject, ttlSeconds = 12 * 3600 }) {
  const header = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claims = b64u(
    JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + ttlSeconds, sub: subject || "mailto:noreply@geiger.studio" }),
  );
  const unsigned = `${header}.${claims}`;
  const signature = sign("sha256", Buffer.from(unsigned), { key: vapidKeyObject(publicKey, privateKey), dsaEncoding: "ieee-p1363" });
  return `vapid t=${unsigned}.${b64u(signature)}, k=${publicKey}`;
}

// True when the stored pair can sign (used by the connection health check).
export function isValidVapidPair(publicKey, privateKey) {
  try {
    vapidAuthorization({ endpoint: "https://push.example.com/x", publicKey, privateKey });
    return true;
  } catch {
    return false;
  }
}

// RFC 8291 encryption of one payload for one subscription ({ p256dh, auth }).
export function encryptPayload({ p256dh, auth }, payload) {
  const uaPublic = fromB64u(p256dh);
  const authSecret = fromB64u(auth);
  if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error("Invalid push subscription keys.");

  const ecdh = createECDH("prime256v1");
  const asPublic = ecdh.generateKeys();
  const shared = ecdh.computeSecret(uaPublic);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", shared, authSecret, keyInfo, 32));

  const salt = randomBytes(16);
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));

  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const plaintext = Buffer.concat([Buffer.from(payload), Buffer.from([0x02])]);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096);
  return Buffer.concat([salt, recordSize, Buffer.from([asPublic.length]), asPublic, encrypted]);
}

// Sends one notification. `gone` = the subscription is dead (404/410) and should be expired.
export async function sendWebPush({ subscription, payload, vapid, ttlSeconds = 86_400, urgency = "normal", topic }) {
  try {
    const data = Buffer.from(typeof payload === "string" ? payload : JSON.stringify(payload));
    if (data.length > 3_800) return { ok: false, status: 0, gone: false, error: "Push payload is too large (max ~3.8 KB)." };
    const body = encryptPayload(subscription.keys || {}, data);
    const res = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: vapidAuthorization({ endpoint: subscription.endpoint, ...vapid }),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(ttlSeconds),
        Urgency: urgency,
        ...(topic ? { Topic: String(topic).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) } : {}),
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 201 || res.status === 200 || res.status === 202) {
      return { ok: true, status: res.status, gone: false, messageId: res.headers.get("location") || null };
    }
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      status: res.status,
      gone: res.status === 404 || res.status === 410,
      error: `Push service returned HTTP ${res.status}${text ? `: ${text.slice(0, 160)}` : ""}`,
    };
  } catch (error) {
    return { ok: false, status: 0, gone: false, error: error?.message || "Couldn't reach the push service." };
  }
}
