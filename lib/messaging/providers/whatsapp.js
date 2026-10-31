import { notConnected } from "../connections";
import { OUTSIDE_WINDOW_CODE, sendTemplate, sendText, toWaId } from "@/lib/channels/whatsapp_cloud";
import { missingTemplateVariables, templateParameters } from "@/lib/channels/whatsapp_templates";
import { deliveryContext, findContact, latestConsent } from "@/lib/channels/records";

// WhatsApp through Meta's Cloud API. message = { template: { id | name, language?, variables } } for an
// approved template (required to open a conversation), or { text } for a free-form reply, which is only
// allowed while the contact's 24-hour customer service window is open — enforced here, not left to Meta.
export const name = "meta_cloud";

const OUTSIDE_WINDOW = "Outside the 24-hour service window — send an approved template instead.";

async function loadTemplate(db, projectId, connection, ref) {
  let query = db.from("message_templates").select("*").eq("project_id", projectId).eq("channel", "whatsapp").is("deleted_at", null);
  if (ref.id) query = query.eq("id", ref.id);
  else query = query.eq("name", ref.name).eq("language", ref.language || "en_US");
  const { data } = await query.limit(1).maybeSingle();
  if (data && data.connection_id && data.connection_id !== connection.id) return null;
  return data || null;
}

async function windowOpen(db, projectId, connection, contactId, phone) {
  let query = db
    .from("conversations")
    .select("window_expires_at")
    .eq("project_id", projectId)
    .eq("channel", "whatsapp")
    .is("deleted_at", null)
    .order("window_expires_at", { ascending: false, nullsFirst: false })
    .limit(1);
  query = contactId ? query.eq("contact_id", contactId) : query.eq("connection_id", connection.id).eq("external_thread_id", phone);
  const { data } = await query.maybeSingle();
  return Boolean(data?.window_expires_at && new Date(data.window_expires_at) > new Date());
}

export async function send({ db, projectId, deliveryId, to, message, connection, secrets }) {
  if (!connection) return notConnected("WhatsApp");
  const base = { provider: name, connectionId: connection.id };
  if (connection.status !== "connected") return { ...base, status: "not_sent", error: "The WhatsApp connection needs attention — refresh it on the WhatsApp screen." };
  const phoneNumberId = connection.external_id;
  const phone = toWaId(to);
  if (!phone) return { ...base, status: "failed", error: "The recipient phone number is invalid." };

  const ctx = await deliveryContext(db, deliveryId);
  const contactId = ctx?.contact_id || (await findContact(db, projectId, { phone: `+${phone}` }))?.id || null;
  const consent = await latestConsent(db, projectId, contactId, "whatsapp");
  if (consent?.status === "opted_out") return { ...base, status: "not_sent", error: "The recipient opted out of WhatsApp messages." };

  let res;
  let subject;
  if (message?.template) {
    const template = await loadTemplate(db, projectId, connection, message.template);
    if (!template) return { ...base, status: "failed", error: "That WhatsApp template doesn't exist for this number." };
    if (template.status !== "approved") return { ...base, status: "not_sent", error: `Template "${template.name}" isn't approved (${template.status}).` };
    const variables = message.template.variables || {};
    if (missingTemplateVariables(template, variables).length) {
      return { ...base, status: "failed", error: `Template "${template.name}" is missing variable values.` };
    }
    subject = template.name;
    res = await sendTemplate(secrets?.accessToken, phoneNumberId, {
      to: phone,
      name: template.name,
      language: template.language,
      components: templateParameters(template, variables),
    });
  } else {
    const text = String(message?.text ?? message?.body ?? "").trim();
    if (!text) return { ...base, status: "failed", error: "A WhatsApp message needs a template or text." };
    if (!(await windowOpen(db, projectId, connection, contactId, phone))) return { ...base, status: "not_sent", error: OUTSIDE_WINDOW };
    subject = text.slice(0, 140);
    res = await sendText(secrets?.accessToken, phoneNumberId, { to: phone, body: text, previewUrl: Boolean(message.previewUrl) });
  }

  if (!res.ok) {
    if (res.error?.code === OUTSIDE_WINDOW_CODE) return { ...base, status: "not_sent", error: OUTSIDE_WINDOW, subject };
    return { ...base, status: "failed", error: res.error.message, uncertain: res.error.uncertain, subject };
  }
  return { ...base, status: "sent", providerId: res.data?.messages?.[0]?.id || null, subject };
}
