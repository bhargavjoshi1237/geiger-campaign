// Thin client for Meta's WhatsApp Cloud API (server-only, Graph API over fetch). Every call takes the
// system-user access token from channel_secrets and returns { ok, status, data, error } — never throws.
// Docs: developers.facebook.com/docs/whatsapp/cloud-api (messages, phone numbers, message templates).

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v23.0";
const BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export const PHONE_HEALTH_FIELDS = "quality_rating,messaging_limit_tier,verified_name,display_phone_number";
const TEMPLATE_FIELDS = "id,name,status,category,language,rejected_reason,quality_score,components";

async function graph(token, path, { method = "GET", body, query } = {}) {
  if (!token) return { ok: false, status: 0, data: null, error: { message: "WhatsApp access token is missing." } };
  const url = new URL(`${BASE}${path}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  try {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.error) {
      const err = data?.error || {};
      return {
        ok: false,
        status: res.status,
        data,
        error: {
          message: err.error_user_msg || err.error_data?.details || err.message || `Meta returned HTTP ${res.status}.`,
          code: err.code ?? null,
          subcode: err.error_subcode ?? null,
        },
      };
    }
    return { ok: true, status: res.status, data, error: null };
  } catch (error) {
    console.error("[whatsapp_cloud]", method, path, error?.message);
    return { ok: false, status: 0, data: null, error: { message: "Couldn't reach Meta's Graph API.", uncertain: true } };
  }
}

// WhatsApp wants international numbers as digits only (no +, spaces or dashes).
export const toWaId = (phone) => String(phone || "").replace(/[^\d]/g, "");

// Number health: quality rating, messaging limit tier, verified name, display number.
export function getPhoneNumber(token, phoneNumberId) {
  return graph(token, `/${encodeURIComponent(phoneNumberId)}`, { query: { fields: PHONE_HEALTH_FIELDS } });
}

export function getBusinessAccount(token, wabaId) {
  return graph(token, `/${encodeURIComponent(wabaId)}`, { query: { fields: "id,name,currency,timezone_id" } });
}

// Free-form text: only valid inside the 24-hour customer service window.
export function sendText(token, phoneNumberId, { to, body, previewUrl = false }) {
  return graph(token, `/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: "POST",
    body: { messaging_product: "whatsapp", recipient_type: "individual", to: toWaId(to), type: "text", text: { body, preview_url: previewUrl } },
  });
}

// Approved template: the only way to open a conversation outside the service window.
export function sendTemplate(token, phoneNumberId, { to, name, language, components = [] }) {
  return graph(token, `/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: "POST",
    body: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toWaId(to),
      type: "template",
      template: { name, language: { code: language }, ...(components.length ? { components } : {}) },
    },
  });
}

export function submitTemplate(token, wabaId, { name, language, category, components }) {
  return graph(token, `/${encodeURIComponent(wabaId)}/message_templates`, {
    method: "POST",
    body: { name, language, category: String(category).toUpperCase(), components },
  });
}

// Edits an existing template (rejected, paused or approved — Meta rate-limits approved edits).
export function editTemplate(token, templateId, { components }) {
  return graph(token, `/${encodeURIComponent(templateId)}`, { method: "POST", body: { components } });
}

export function getTemplate(token, templateId) {
  return graph(token, `/${encodeURIComponent(templateId)}`, { query: { fields: TEMPLATE_FIELDS } });
}

// Every template on the WABA (follows paging up to `maxPages`).
export async function listTemplates(token, wabaId, { maxPages = 5 } = {}) {
  const templates = [];
  let after = null;
  for (let page = 0; page < maxPages; page += 1) {
    const res = await graph(token, `/${encodeURIComponent(wabaId)}/message_templates`, {
      query: { fields: TEMPLATE_FIELDS, limit: 100, after },
    });
    if (!res.ok) return page === 0 ? res : { ok: true, status: res.status, data: templates, error: null };
    templates.push(...(res.data?.data || []));
    after = res.data?.paging?.cursors?.after;
    if (!res.data?.paging?.next || !after) break;
  }
  return { ok: true, status: 200, data: templates, error: null };
}

export function deleteTemplate(token, wabaId, { name, id }) {
  return graph(token, `/${encodeURIComponent(wabaId)}/message_templates`, {
    method: "DELETE",
    query: { name, hsm_id: id },
  });
}

// Meta error code for "re-engagement message" (free-form text outside the 24h window).
export const OUTSIDE_WINDOW_CODE = 131047;
