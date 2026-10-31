// Destination URL policy for outgoing requests (pure): HTTPS only in production and never a private,
// loopback or link-local host, so a webhook can't be pointed at internal infrastructure.

const PRIVATE_V4 = [/^10\./, /^127\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];

function isPrivateHost(host) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return PRIVATE_V4.some((re) => re.test(h));
  if (h.includes(":")) return h === "::1" || h === "::" || /^f[cd]/.test(h) || /^fe80/.test(h) || h.startsWith("::ffff:");
  return false;
}

// Returns an error message, or null when the URL may receive requests.
export function destinationUrlError(value, { allowHttp = process.env.NODE_ENV !== "production" } = {}) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    return "Enter a full URL, like https://example.com/webhooks/geiger.";
  }
  if (url.protocol !== "https:" && !(allowHttp && url.protocol === "http:")) return "The URL must start with https://.";
  if (url.username || url.password) return "Put credentials in your receiver's config, not the URL.";
  if (isPrivateHost(url.hostname)) return "Private, loopback and internal addresses can't receive webhooks.";
  return null;
}
