import { renderEmailDocument } from "@/lib/email/blocks";
import { applyMergeTags } from "@/lib/email/merge_tags";

// Transactional template rendering (isomorphic, pure) — the same code renders the screen preview and the
// API send. Block documents go through the Email Builder renderer; HTML templates get merge tags with
// HTML-escaped values. `template` is the camelCase view model from lib/supabase/transactional_templates.

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const escapeDeep = (value) => {
  if (typeof value === "string") return escapeHtml(value);
  if (Array.isArray(value)) return value.map(escapeDeep);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, escapeDeep(v)]));
  return value;
};

export function htmlToText(html) {
  return String(html || "")
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Merge-tag keys referenced by the subject / preheader / HTML ({{order_id}}, {{customer.name|there}}).
export function detectVariables(...texts) {
  const keys = new Set();
  for (const text of texts) {
    for (const m of String(text || "").matchAll(/\{\{\s*([\w.]+)(?:\|[^}]*)?\s*\}\}/g)) keys.add(m[1]);
  }
  return Array.from(keys);
}

const read = (data, key) => key.split(".").reduce((acc, part) => (acc == null ? acc : acc[part]), data);

export function missingVariables(template, data = {}) {
  return (template.variables || [])
    .filter((v) => v.required)
    .map((v) => v.key)
    .filter((key) => {
      const value = read(data, key);
      return value == null || value === "";
    });
}

// { key: sample } from the template's variable schema (preview + test sends).
export function sampleData(template) {
  const data = {};
  for (const v of template.variables || []) {
    if (!v.key) continue;
    const parts = v.key.split(".");
    let node = data;
    parts.slice(0, -1).forEach((p) => {
      node[p] = node[p] && typeof node[p] === "object" ? node[p] : {};
      node = node[p];
    });
    node[parts[parts.length - 1]] = v.sample ?? "";
  }
  return data;
}

function withPreheader(html, preheader) {
  if (!preheader) return html;
  const hidden = `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>`;
  return /<body[^>]*>/i.test(html) ? html.replace(/<body[^>]*>/i, (m) => `${m}${hidden}`) : `${hidden}${html}`;
}

export function renderTransactional(template, data = {}, { brand = {} } = {}) {
  const subject = applyMergeTags(template.subject || "", data);
  const preheader = applyMergeTags(template.preheader || "", data);
  if (template.format === "blocks") {
    const { html, text } = renderEmailDocument(template.content || {}, { mergeData: data, brand, preheader });
    return { subject, html, text };
  }
  const html = withPreheader(applyMergeTags(template.html || "", escapeDeep(data)), preheader);
  return { subject, html, text: htmlToText(html) };
}
