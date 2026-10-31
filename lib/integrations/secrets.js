import { createHash, randomBytes } from "node:crypto";

// Server-only credential minting: unbiased base62 strings (rejection sampling over random bytes) and
// sha256 hashing for anything stored as a verifier rather than a secret.

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function randomBase62(length = 32) {
  let out = "";
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < 248) out += ALPHABET[byte % 62];
      if (out.length === length) break;
    }
  }
  return out;
}

export function sha256Hex(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function newSigningSecret() {
  return `whsec_${randomBase62(32)}`;
}

export const lastFour = (value) => String(value || "").slice(-4);
