// Absolute public URLs for links that leave the app (tracking pixels, click redirects, unsubscribe,
// hosted pages, webhooks). CAMPAIGN_PUBLIC_URL is the deployed origin including the /campaign base path
// (https://geiger.studio/campaign); local dev falls back to localhost.

export function publicBaseUrl() {
  const configured = process.env.CAMPAIGN_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, "");
  return `http://localhost:${process.env.PORT || 3000}${process.env.NEXT_PUBLIC_BASE_PATH || ""}`;
}

export function publicUrl(path = "/", params = null) {
  const url = new URL(`${publicBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}
