import { isSigningConfigured, signToken, verifyToken } from "@/lib/server/tokens";

// Signed "this visitor is contact X" tokens. Hosted form submits set them as a first-party cookie, and
// outbound links may carry one as ?gc=<token>, so short-link clicks and survey answers can be tied to a
// contact. Tamper-proof, not secret: the payload is only the contact uuid. Server-only.

export const CONTACT_COOKIE = "gc_ct";
const KIND = "ct";

export function contactLinkToken(contactId) {
  if (!contactId || !isSigningConfigured()) return null;
  return signToken({ k: KIND, c: contactId }, { ttlDays: 400 });
}

export function contactFromToken(token) {
  if (!token || !isSigningConfigured()) return null;
  return verifyToken(token, KIND)?.c || null;
}

function readCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

// The contact a request identifies, from ?gc= first, then the cookie.
export function contactFromRequest(request, url = new URL(request.url)) {
  return contactFromToken(url.searchParams.get("gc")) || contactFromToken(readCookie(request, CONTACT_COOKIE));
}

export function contactCookie(contactId) {
  const token = contactLinkToken(contactId);
  if (!token) return null;
  const path = process.env.NEXT_PUBLIC_BASE_PATH || "/";
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${CONTACT_COOKIE}=${encodeURIComponent(token)}; Path=${path}; Max-Age=${400 * 86400}; HttpOnly; SameSite=Lax${secure}`;
}
