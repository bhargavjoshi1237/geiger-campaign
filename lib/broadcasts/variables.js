// Template variable mapping (isomorphic, pure): the {{n}} slots an approved WhatsApp template exposes, each
// mapped to a contact field or a fixed value, resolved per recipient into the provider's variables shape
// { header: [...], body: [...], buttons: { [index]: value } }. SMS/RCS text uses merge tags instead.

import { CONTACT_MERGE_FIELDS, applyMergeTags, contactMergeData, resolveMergeValue } from "@/lib/email/merge_tags";
import { variableCount } from "@/lib/channels/whatsapp_templates";

export const FIELD_OPTIONS = CONTACT_MERGE_FIELDS.filter((f) => f.type === "text").map((f) => ({ value: f.key, label: f.label }));

const components = (template) => (Array.isArray(template?.components) ? template.components : []);

// Every variable slot in the template, in send order.
export function templateSlots(template) {
  const slots = [];
  const header = components(template).find((c) => String(c.type).toUpperCase() === "HEADER" && c.format === "TEXT");
  for (let i = 0; i < variableCount(header?.text); i += 1) {
    slots.push({ part: "header", index: i, key: `header.${i}`, label: `Header {{${i + 1}}}`, sample: header?.example?.header_text?.[i] || "" });
  }
  const body = components(template).find((c) => String(c.type).toUpperCase() === "BODY");
  for (let i = 0; i < variableCount(body?.text); i += 1) {
    slots.push({ part: "body", index: i, key: `body.${i}`, label: `Body {{${i + 1}}}`, sample: body?.example?.body_text?.[0]?.[i] || "" });
  }
  const buttons = components(template).find((c) => String(c.type).toUpperCase() === "BUTTONS")?.buttons || [];
  buttons.forEach((b, index) => {
    if (String(b.type).toUpperCase() === "URL" && variableCount(b.url)) {
      slots.push({ part: "button", index, key: `button.${index}`, label: `“${b.text}” link {{1}}`, sample: Array.isArray(b.example) ? b.example[0] || "" : "" });
    }
  });
  return slots;
}

export function slotMapping(mapping, slot) {
  const m = mapping || {};
  if (slot.part === "button") return m.buttons?.[slot.index] || null;
  return m[slot.part]?.[slot.index] || null;
}

export function setSlotMapping(mapping, slot, value) {
  const next = { header: [...(mapping?.header || [])], body: [...(mapping?.body || [])], buttons: { ...(mapping?.buttons || {}) } };
  if (slot.part === "button") next.buttons[slot.index] = value;
  else next[slot.part][slot.index] = value;
  return next;
}

// One slot's value for a contact: the field (or its fallback), or the fixed value.
export function resolveSlot(map, mergeData) {
  if (!map) return "";
  if (map.source === "static") return String(map.value ?? "");
  const value = resolveMergeValue(mergeData, map.field);
  return value == null || value === "" ? String(map.fallback ?? "") : String(value);
}

// Slots that can't produce a value: no mapping, a field without a fallback is allowed (it may be empty per contact).
export function unmappedSlots(template, mapping) {
  return templateSlots(template).filter((slot) => {
    const map = slotMapping(mapping, slot);
    if (!map) return true;
    if (map.source === "static") return !String(map.value ?? "").trim();
    return !map.field;
  });
}

export function buildTemplateVariables(template, mapping, contact) {
  const data = contactMergeData(contact);
  const out = { header: [], body: [], buttons: {} };
  for (const slot of templateSlots(template)) {
    const value = resolveSlot(slotMapping(mapping, slot), data);
    if (slot.part === "button") out.buttons[slot.index] = value;
    else out[slot.part][slot.index] = value;
  }
  return out;
}

// Contacts whose mapped fields come out empty with no fallback (they'd fail at Meta).
export function emptyForContact(template, mapping, contact) {
  const data = contactMergeData(contact);
  return templateSlots(template).filter((slot) => !resolveSlot(slotMapping(mapping, slot), data).trim());
}

export function renderText(text, contact) {
  return applyMergeTags(text, contactMergeData(contact));
}
