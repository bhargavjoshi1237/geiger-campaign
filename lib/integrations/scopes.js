// API key scopes (pure, client-safe). Secret keys (gck_live_…) may hold any scope; public keys (gcp_…)
// are embedded in customer pages and only ever ingest events.

export const API_SCOPES = [
  { key: "contacts:read", label: "Read contacts", description: "GET /api/v1/contacts" },
  { key: "contacts:write", label: "Write contacts", description: "POST /api/v1/contacts (create or update)" },
  { key: "events:write", label: "Send events", description: "POST /api/v1/events and the tracking snippet" },
  { key: "messages:send", label: "Send messages", description: "POST /api/v1/messages" },
  { key: "campaigns:read", label: "Read campaigns", description: "GET /api/v1/campaigns" },
  { key: "data:write", label: "Write catalogs & objects", description: "PUT /api/v1/catalogs/… and /api/v1/objects/…" },
];

export const API_SCOPE_KEYS = API_SCOPES.map((s) => s.key);

export const PUBLIC_KEY_SCOPES = ["events:write"];

export const KEY_KINDS = {
  secret: { label: "Secret", prefix: "gck_live_", description: "Server-to-server. Keep it out of browsers and source control." },
  public: { label: "Public", prefix: "gcp_", description: "Safe to embed in web pages. Can only send tracking events." },
};

export const EXPIRY_OPTIONS = [
  { value: "never", label: "Never", days: null },
  { value: "30", label: "30 days", days: 30 },
  { value: "90", label: "90 days", days: 90 },
  { value: "365", label: "1 year", days: 365 },
];

export function scopeLabel(key) {
  return API_SCOPES.find((s) => s.key === key)?.label || key;
}
