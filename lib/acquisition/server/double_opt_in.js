import { dispatch } from "@/lib/messaging/dispatch";
import { recordEvent } from "@/lib/events/record";
import { getWorkspaceSettings } from "@/lib/settings/server";
import { isSigningConfigured, signToken, verifyToken } from "@/lib/server/tokens";
import { publicUrl } from "@/lib/server/urls";
import { confirmationEmail } from "./email_templates";

// Double opt-in: a signed confirm link (7 days) emailed through dispatch, and the confirmation that flips
// the contact, its pending list memberships and its email consent to subscribed. Server-only.

const TOKEN_KIND = "doi";

export function confirmLink(formId, token) {
  return publicUrl(`/f/${formId}/confirm`, { token });
}

export async function sendDoubleOptIn(db, { form, contact, submissionId, brand }) {
  if (!contact?.email) return { status: "not_sent", error: "The contact has no email address." };
  if (!isSigningConfigured()) {
    console.error("[acquisition.doi] CAMPAIGN_SIGNING_SECRET is not set; confirmation email not sent");
    return { status: "not_sent", error: "Signing isn't configured (CAMPAIGN_SIGNING_SECRET)." };
  }
  const token = signToken({ k: TOKEN_KIND, s: submissionId, c: contact.id, f: form.id }, { ttlDays: 7 });
  const { subject, html } = confirmationEmail({ brand, formName: form.name, confirmUrl: confirmLink(form.id, token) });
  const settings = await getWorkspaceSettings(db, form.projectId);
  const { fromName, fromEmail } = settings?.sending || {};
  const from = fromEmail ? (fromName ? `${fromName} <${fromEmail}>` : fromEmail) : undefined;
  return dispatch({
    db,
    projectId: form.projectId,
    channel: "email",
    to: contact.email,
    contactId: contact.id,
    source: { type: "transactional", id: form.id },
    idempotencyKey: `doi:${submissionId}`,
    message: { subject, html, from, label: "campaign.double_opt_in" },
    metadata: { kind: "double_opt_in", formId: form.id, submissionId },
  });
}

// { status: "confirmed" | "already" | "invalid", formId?, contactId? } — idempotent, safe to call twice.
export async function confirmDoubleOptIn(db, token, { ip = null, userAgent = null } = {}) {
  const payload = isSigningConfigured() ? verifyToken(token, TOKEN_KIND) : null;
  if (!payload?.s || !payload?.c) return { status: "invalid" };

  const { data: submission } = await db.from("form_submissions").select("*").eq("id", payload.s).maybeSingle();
  if (!submission || submission.contact_id !== payload.c) return { status: "invalid" };
  if (submission.status === "confirmed") return { status: "already", formId: submission.form_id, contactId: submission.contact_id };

  const now = new Date().toISOString();
  const projectId = submission.project_id;
  const { data: form } = await db.from("forms").select("id, name, settings").eq("id", submission.form_id).maybeSingle();
  const { data: contact } = await db.from("contacts").select("id, status").eq("id", payload.c).maybeSingle();
  if (!contact) return { status: "invalid" };

  // Bounced/complained addresses stay suppressed; anyone else who confirms is subscribed.
  if (!["bounced", "complained"].includes(contact.status)) {
    await db.from("contacts").update({ status: "subscribed", unsubscribed_at: null }).eq("id", contact.id);
  }
  const listIds = Array.isArray(form?.settings?.listIds) ? form.settings.listIds : [];
  if (listIds.length) {
    await db
      .from("list_members")
      .update({ status: "subscribed" })
      .eq("contact_id", contact.id)
      .eq("status", "pending")
      .in("list_id", listIds);
  }
  const { error: consentError } = await db.from("contact_consents").insert({
    project_id: projectId,
    contact_id: contact.id,
    channel: "email",
    status: "opted_in",
    source: "double_opt_in",
    proof: { method: "double_opt_in", formId: submission.form_id, formName: form?.name || "", submissionId: submission.id, confirmedAt: now },
    ip,
    user_agent: userAgent,
    captured_at: now,
  });
  if (consentError) console.error("[acquisition.doi.consent]", consentError.message);

  await db.from("form_submissions").update({ status: "confirmed", confirmed_at: now }).eq("id", submission.id);
  await recordEvent(db, {
    projectId,
    contactId: contact.id,
    name: "subscription_confirmed",
    properties: { formId: submission.form_id, submissionId: submission.id },
    source: "form",
    utm: submission.utm || {},
  });
  return { status: "confirmed", formId: submission.form_id, contactId: contact.id };
}
