import { dispatch } from "@/lib/messaging/dispatch";
import { getWorkspaceSettings } from "@/lib/settings/server";
import { ApiError, badRequest, notFound } from "@/lib/server/http";
import { channelSettings } from "./policy";
import { findContact } from "./records";
import { toE164 } from "./twilio";
import { missingVariables, renderTransactional, sampleData } from "./transactional_render";

// Transactional sends (server-only, service-role db): the developer API (POST /api/v1/messages) and the
// template "Send test" both land here. Email renders a transactional template (or takes raw subject +
// html) and leaves through dispatch -> geiger-dash; SMS and WhatsApp go through their providers.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function templateFromRow(row) {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    status: row.status,
    format: row.format || "html",
    subject: row.subject || "",
    preheader: row.preheader || "",
    content: row.content || {},
    html: row.html || "",
    fromName: row.from_name || "",
    fromEmail: row.from_email || "",
    variables: Array.isArray(row.variables) ? row.variables : [],
    version: Number(row.version || 1),
  };
}

export async function loadTransactionalTemplate(db, projectId, ref) {
  let query = db.from("transactional_templates").select("*").eq("project_id", projectId).is("deleted_at", null);
  query = UUID.test(String(ref)) ? query.eq("id", ref) : query.eq("key", String(ref));
  const { data } = await query.limit(1).maybeSingle();
  return data ? templateFromRow(data) : null;
}

const formatFrom = (name, email) => (email ? (name ? `${name} <${email}>` : email) : undefined);

const brandFor = async (db, projectId) => (await getWorkspaceSettings(db, projectId))?.branding || {};

// The project's default email sender (Email channel settings), as a From header.
async function defaultEmailFrom(db, projectId) {
  const { data } = await db
    .from("channel_connections")
    .select("metadata")
    .eq("project_id", projectId)
    .eq("channel", "email")
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  const senders = Array.isArray(data?.metadata?.senders) ? data.metadata.senders : [];
  const settings = channelSettings({ metadata: data?.metadata }, "email");
  const sender = senders.find((s) => s.id === settings.defaultSender) || senders.find((s) => s.isDefault);
  return sender ? formatFrom(sender.fromName, sender.email) : undefined;
}

async function buildEmail(db, projectId, body) {
  if (body.template) {
    const template = await loadTransactionalTemplate(db, projectId, body.template);
    if (!template) throw notFound(`No transactional template "${body.template}".`);
    if (template.status !== "active") throw new ApiError(409, `Template "${template.key}" isn't active.`, "template_inactive");
    const data = body.data && typeof body.data === "object" ? body.data : {};
    const missing = missingVariables(template, data);
    if (missing.length) throw new ApiError(422, `Missing template data: ${missing.join(", ")}.`, "missing_variables");
    const rendered = renderTransactional(template, data, { brand: await brandFor(db, projectId) });
    return {
      template,
      message: {
        subject: body.subject ? String(body.subject) : rendered.subject,
        html: rendered.html,
        from: body.from || formatFrom(template.fromName, template.fromEmail) || (await defaultEmailFrom(db, projectId)),
        label: `campaign.transactional.${template.key}`,
      },
    };
  }
  if (!body.subject || !body.html) throw badRequest("Send a template key, or both subject and html.");
  return {
    template: null,
    message: {
      subject: String(body.subject),
      html: String(body.html),
      from: body.from || (await defaultEmailFrom(db, projectId)),
      label: "campaign.transactional",
    },
  };
}

// One message to one recipient. Returns dispatch's { status, deliveryId, error, duplicate? }.
export async function sendTransactionalMessage(db, { projectId, body = {}, keyId = null, idempotencyKey = null, test = false }) {
  const channel = String(body.channel || "email");
  const to = String(body.to || "").trim();
  const meta = { apiKeyId: keyId };
  let message;
  let contact = null;
  let sourceId = null;

  if (channel === "email") {
    if (!EMAIL.test(to)) throw badRequest("`to` must be one email address.");
    const built = await buildEmail(db, projectId, body);
    message = built.message;
    if (built.template) {
      sourceId = built.template.id;
      Object.assign(meta, { templateKey: built.template.key, templateVersion: built.template.version });
    }
    contact = await findContact(db, projectId, { email: to });
  } else if (channel === "sms") {
    const phone = toE164(to);
    if (!phone) throw badRequest("`to` must be a phone number in international format.");
    const text = String(body.text ?? body.body ?? "").trim();
    if (!text) throw badRequest("SMS needs `text`.");
    message = { body: text, from: body.from || undefined };
    contact = await findContact(db, projectId, { phone });
  } else if (channel === "whatsapp") {
    const phone = toE164(to);
    if (!phone) throw badRequest("`to` must be a phone number in international format.");
    const ref = body.template;
    if (!ref) throw badRequest("WhatsApp sends through the API need an approved `template`.");
    message = {
      template: UUID.test(String(ref?.id ?? ref))
        ? { id: ref?.id ?? ref, variables: body.variables || {} }
        : { name: ref?.name ?? ref, language: ref?.language || body.language || "en_US", variables: body.variables || {} },
    };
    contact = await findContact(db, projectId, { phone });
  } else {
    throw badRequest("`channel` must be email, sms or whatsapp.");
  }

  return dispatch({
    db,
    projectId,
    channel,
    to,
    contactId: contact?.id || null,
    source: { type: test ? "test" : "transactional", id: sourceId },
    idempotencyKey: idempotencyKey ? `tx:${projectId}:${String(idempotencyKey).slice(0, 200)}` : null,
    message,
    metadata: meta,
  });
}

// Workspace "Send test": the template rendered with its sample data (or the caller's data).
export async function sendTemplateTest(db, { projectId, templateId, to, data, userId }) {
  const template = await loadTransactionalTemplate(db, projectId, templateId);
  if (!template) throw notFound("That template doesn't exist.");
  const payload = data && typeof data === "object" && Object.keys(data).length ? data : sampleData(template);
  const rendered = renderTransactional(template, payload, { brand: await brandFor(db, projectId) });
  if (!EMAIL.test(String(to || ""))) throw badRequest("Enter an email address to send the test to.");
  return dispatch({
    db,
    projectId,
    channel: "email",
    to,
    source: { type: "test", id: template.id },
    message: {
      subject: `[Test] ${rendered.subject || template.name}`,
      html: rendered.html,
      from: formatFrom(template.fromName, template.fromEmail) || (await defaultEmailFrom(db, projectId)),
      label: `campaign.transactional.${template.key}.test`,
    },
    metadata: { test: true, sentBy: userId || null, templateKey: template.key, templateVersion: template.version },
  });
}
