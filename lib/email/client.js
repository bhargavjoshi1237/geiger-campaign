// The suite email client (server-only). geiger-dash is the mother project that owns the email stack —
// templates, rendering, Resend delivery and the send log — so this app never bundles its own. Every
// email leaves through dash's cross-app API, mirroring geiger-events / geiger-property:
//
//   POST {GEIGER_EMAIL_API_URL}/api/email/send   Authorization: Bearer {GEIGER_EMAIL_API_KEY}
//
// Two modes, as dash supports:
//   template — { template: "campaign.<key>", to, data }  for system mail rendered by dash's library
//   rendered — { html, subject, to, from?, template? }    for campaign content this app renders itself
//                                                         (template is then only the log label)
// Never throws; never leaks the key (a non-public env var, imported only from server code).

const DEFAULT_API_URL = "https://geiger.studio";

export function isEmailConfigured() {
  return Boolean(process.env.GEIGER_EMAIL_API_KEY);
}

export async function sendSuiteEmail({
  template,
  to,
  data = {},
  subject,
  html,
  from,
  idempotencyKey,
  signal,
} = {}) {
  const apiKey = process.env.GEIGER_EMAIL_API_KEY;
  const baseUrl = (process.env.GEIGER_EMAIL_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");

  if (!apiKey) {
    console.error("[email] GEIGER_EMAIL_API_KEY is not set — skipping send");
    return { ok: false, error: "not_configured" };
  }
  if (!to || (!template && !html)) {
    return { ok: false, error: "to and either template or html are required" };
  }
  if (html && !subject) {
    return { ok: false, error: "subject is required with html" };
  }

  const body = html
    ? { to, html, subject, ...(from ? { from } : {}), ...(template ? { template } : {}) }
    : { template, to, data, ...(subject ? { subject } : {}), ...(from ? { from } : {}) };

  try {
    const res = await fetch(`${baseUrl}/api/email/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(15_000),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("[email] send failed:", res.status, json?.error);
      return { ok: false, error: json?.error || `HTTP ${res.status}`, uncertain: res.status >= 500 };
    }

    return { ok: true, id: json.id, providerId: json.providerId };
  } catch (err) {
    console.error("[email] send request error:", err);
    return { ok: false, error: "request_failed", uncertain: true };
  }
}
