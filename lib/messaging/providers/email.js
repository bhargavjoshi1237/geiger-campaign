import { sendSuiteEmail } from "@/lib/email/client";

// Email leaves through geiger-dash's cross-app API in pre-rendered mode: this app renders the campaign
// HTML (blocks + tracking) and dash delivers it through its Resend account and send log.
export const name = "geiger_email";

export async function send({ to, message, idempotencyKey }) {
  const { subject, html, from, label } = message;
  if (!subject || !html) return { status: "failed", error: "Email needs a subject and HTML body." };

  const res = await sendSuiteEmail({
    to,
    subject,
    html,
    from,
    template: label || "campaign.email",
    idempotencyKey,
  });
  if (res.ok) return { status: "sent", providerId: res.providerId || res.id || null, subject };
  if (res.error === "not_configured") {
    return { status: "not_sent", error: "Email delivery isn't configured (GEIGER_EMAIL_API_KEY).", subject };
  }
  return { status: "failed", error: res.error, uncertain: res.uncertain, subject };
}
