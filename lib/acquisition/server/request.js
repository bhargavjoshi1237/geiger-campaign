// Request plumbing for the public (cookie-less, cross-origin) acquisition routes: caller IP, a body
// reader that accepts JSON, form posts and text/plain JSON, and same-origin absolute URLs. Server-only.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value) => typeof value === "string" && UUID.test(value);

export function clientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const first = forwarded.split(",")[0]?.trim();
  return (first || request.headers.get("x-real-ip") || "").slice(0, 64) || null;
}

export function userAgent(request) {
  return (request.headers.get("user-agent") || "").slice(0, 500) || null;
}

// { body, isForm }: isForm is true for a classic <form> post (the no-JS fallback), which wants a redirect.
export async function readPayload(request) {
  const type = request.headers.get("content-type") || "";
  try {
    if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
      const form = await request.formData();
      const body = {};
      for (const [key, value] of form.entries()) {
        if (typeof value !== "string") continue;
        if (key in body) body[key] = [].concat(body[key], value);
        else body[key] = value;
      }
      return { body, isForm: true };
    }
    const text = await request.text();
    if (!text) return { body: {}, isForm: false };
    const parsed = JSON.parse(text);
    return { body: parsed && typeof parsed === "object" ? parsed : {}, isForm: false };
  } catch {
    return { body: null, isForm: false };
  }
}

export function cleanText(value, max = 500) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v ? v.slice(0, max) : null;
}

export function cleanUrl(value) {
  const v = cleanText(value, 2000);
  if (!v) return null;
  try {
    const url = new URL(v);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

// Absolute URL on this deployment (honours the /campaign base path) for redirects back to our pages.
export function appUrl(request, path, params = null) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const url = new URL(`${base}${path.startsWith("/") ? path : `/${path}`}`, request.url);
  if (params) for (const [k, v] of Object.entries(params)) if (v != null && v !== "") url.searchParams.set(k, String(v));
  return url;
}
