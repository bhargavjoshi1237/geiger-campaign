import { ApiError, notFound } from "@/lib/server/http";
import { loadConnection } from "@/lib/messaging/connections";
import * as wa from "./whatsapp_cloud";
import { draftFromTemplate, fromMetaStatus, validateTemplateDraft } from "./whatsapp_templates";

// WhatsApp template lifecycle against Meta (server-only, service-role db): submit for approval (or edit
// a submitted one), pull review status / rejection reason / quality back, import templates created in
// WhatsApp Manager, and delete remotely. The Meta webhook owner can call applyTemplateStatusUpdate().

async function whatsappConnection(db, projectId, connectionId) {
  const { connection, secrets } = await loadConnection(db, projectId, "whatsapp", connectionId);
  if (!connection || connection.status !== "connected") {
    throw new ApiError(409, "Connect a WhatsApp number before submitting templates.", "not_connected");
  }
  if (!secrets?.accessToken || !connection.config?.wabaId) {
    throw new ApiError(409, "The WhatsApp connection is missing its access token or business account id.", "not_connected");
  }
  return { connection, token: secrets.accessToken, wabaId: connection.config.wabaId };
}

async function loadTemplateRow(db, projectId, templateId) {
  const { data } = await db
    .from("message_templates")
    .select("*")
    .eq("project_id", projectId)
    .eq("id", templateId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) throw notFound("That template doesn't exist.");
  return data;
}

export async function submitTemplate(db, { projectId, templateId }) {
  const template = await loadTemplateRow(db, projectId, templateId);
  const issues = validateTemplateDraft(draftFromTemplate(template));
  if (issues.length) throw new ApiError(422, issues[0].message, "invalid_template");

  const { connection, token, wabaId } = await whatsappConnection(db, projectId, template.connection_id);
  const resubmit = Boolean(template.external_id) && template.status !== "draft";
  const res = resubmit
    ? await wa.editTemplate(token, template.external_id, { components: template.components })
    : await wa.submitTemplate(token, wabaId, {
        name: template.name,
        language: template.language,
        category: template.category,
        components: template.components,
      });

  const now = new Date().toISOString();
  const metadata = { ...(template.metadata || {}) };
  if (!res.ok) {
    metadata.lastSubmitError = { message: res.error.message, at: now };
    await db.from("message_templates").update({ metadata }).eq("id", template.id);
    throw new ApiError(422, res.error.message, "provider_rejected");
  }

  metadata.lastSubmitError = null;
  metadata.submitted = { components: template.components, category: template.category, language: template.language, at: now };
  const { data, error } = await db
    .from("message_templates")
    .update({
      connection_id: connection.id,
      external_id: res.data?.id || template.external_id,
      status: resubmit ? "pending" : fromMetaStatus(res.data?.status),
      category: res.data?.category ? String(res.data.category).toLowerCase() : template.category,
      rejection_reason: null,
      submitted_at: now,
      metadata,
    })
    .eq("id", template.id)
    .select("*")
    .single();
  if (error) throw new ApiError(500, "Meta accepted the template but it couldn't be saved here.", "save_failed");
  return data;
}

const statusPatch = (remote) => ({
  status: fromMetaStatus(remote.status),
  rejection_reason: remote.rejected_reason && remote.rejected_reason !== "NONE" ? remote.rejected_reason : null,
  quality_score: remote.quality_score?.score || null,
  category: remote.category ? String(remote.category).toLowerCase() : undefined,
  external_id: remote.id,
  last_synced_at: new Date().toISOString(),
});

const clean = (patch) => Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));

// Pulls every template on each connected WABA and reconciles local rows; imports unknown ones.
export async function syncTemplates(db, { projectId, userId = null }) {
  const { data: connections } = await db
    .from("channel_connections")
    .select("id, config, status")
    .eq("project_id", projectId)
    .eq("channel", "whatsapp")
    .eq("status", "connected")
    .is("deleted_at", null);
  if (!connections?.length) throw new ApiError(409, "Connect a WhatsApp number to sync templates.", "not_connected");

  const { data: locals } = await db
    .from("message_templates")
    .select("*")
    .eq("project_id", projectId)
    .eq("channel", "whatsapp")
    .is("deleted_at", null);
  const rows = locals || [];
  const summary = { updated: 0, imported: 0, errors: [] };

  for (const connection of connections) {
    const { secrets } = await loadConnection(db, projectId, "whatsapp", connection.id);
    const res = await wa.listTemplates(secrets?.accessToken, connection.config?.wabaId);
    if (!res.ok) {
      summary.errors.push(res.error.message);
      continue;
    }
    for (const remote of res.data) {
      const match = rows.find(
        (t) => (t.external_id && t.external_id === remote.id) || (t.name === remote.name && t.language === remote.language),
      );
      if (match) {
        await db.from("message_templates").update(clean({ ...statusPatch(remote), connection_id: connection.id })).eq("id", match.id);
        summary.updated += 1;
      } else {
        const { error } = await db.from("message_templates").insert({
          ...clean(statusPatch(remote)),
          project_id: projectId,
          connection_id: connection.id,
          channel: "whatsapp",
          name: remote.name,
          language: remote.language,
          category: String(remote.category || "marketing").toLowerCase(),
          components: remote.components || [],
          created_by: userId,
          metadata: { importedFromMeta: true },
        });
        if (!error) summary.imported += 1;
      }
    }
  }
  return summary;
}

// Deletes the template on Meta (when it was submitted) and soft-deletes it here.
export async function deleteTemplate(db, { projectId, templateId }) {
  const template = await loadTemplateRow(db, projectId, templateId);
  if (template.external_id) {
    const { connection, secrets } = await loadConnection(db, projectId, "whatsapp", template.connection_id);
    if (connection && secrets?.accessToken && connection.config?.wabaId) {
      const res = await wa.deleteTemplate(secrets.accessToken, connection.config.wabaId, { name: template.name, id: template.external_id });
      if (!res.ok && res.status !== 404) throw new ApiError(502, `Meta couldn't delete it: ${res.error.message}`, "provider_error");
    }
  }
  const { error } = await db.from("message_templates").update({ deleted_at: new Date().toISOString() }).eq("id", template.id);
  if (error) throw new ApiError(500, "Couldn't delete the template.", "save_failed");
  return true;
}

// For the Meta webhook route: field "message_template_status_update" value -> local row.
export async function applyTemplateStatusUpdate(db, value) {
  if (!value?.message_template_id) return false;
  const { error } = await db
    .from("message_templates")
    .update({
      status: fromMetaStatus(value.event),
      rejection_reason: value.reason && value.reason !== "NONE" ? value.reason : null,
      last_synced_at: new Date().toISOString(),
    })
    .eq("external_id", String(value.message_template_id))
    .is("deleted_at", null);
  return !error;
}
