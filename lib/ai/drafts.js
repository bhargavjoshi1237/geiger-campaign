import * as emailBlocks from "@/lib/email/blocks";

// Turns AI output into campaign drafts (isomorphic, pure): email copy becomes a builder document in the block
// format ({ blocks: [{ id, type, props }] }), text channels keep their body in content.text — the shapes
// lib/email/blocks.js and lib/campaigns/messages.js read.

const CHANNEL = { email: "email", multi: "email", sms: "sms", whatsapp: "whatsapp" };

let counter = 0;
function block(type, props) {
  if (typeof emailBlocks.createBlock === "function") return emailBlocks.createBlock(type, props);
  counter += 1;
  return { id: `blk_${globalThis.crypto?.randomUUID?.().slice(0, 8) ?? `${Date.now().toString(36)}${counter}`}`, type, props };
}

const paragraphs = (body) =>
  String(body || "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

// Email document from a headline, body (blank-line separated paragraphs) and CTA label.
export function emailDocumentFrom({ headline = "", body = "", cta = "" }) {
  const blocks = [];
  if (headline) blocks.push(block("heading", { text: headline, level: 1 }));
  for (const p of paragraphs(body)) blocks.push(block("text", { text: p }));
  if (cta) blocks.push(block("button", { label: cta, href: "" }));
  return { blocks };
}

// Appends copy to an existing email document as text blocks (never replaces the user's content).
export function appendCopyToDocument(doc, text) {
  const blocks = Array.isArray(doc?.blocks) ? doc.blocks : [];
  return { ...(doc || {}), blocks: [...blocks, ...paragraphs(text).map((p) => block("text", { text: p }))] };
}

// Brief generation ({ id, input, output }) + chosen variant -> createCampaign() input (status draft).
export function briefToCampaignInput(generation, variantLabel, { createdBy = null } = {}) {
  const output = generation?.output || {};
  const brief = output.brief || {};
  const variant = (brief.variants || []).find((v) => v.label === variantLabel) || brief.variants?.[0] || {};
  const channel = CHANNEL[generation?.input?.channel] || "email";
  const audience = output.audience;
  const content = channel === "email" ? emailDocumentFrom(variant) : { text: variant.body || "" };
  return {
    name: brief.title || "AI brief draft",
    channel,
    type: "regular",
    status: "draft",
    subject: channel === "email" ? variant.subject || "" : "",
    preheader: channel === "email" ? variant.preheader || "" : "",
    content,
    audience:
      audience?.kind === "list"
        ? { listIds: [audience.id] }
        : audience?.kind === "segment"
          ? { segmentIds: [audience.id] }
          : { all: true },
    createdBy,
    metadata: {
      source: "ai_brief",
      aiGenerationId: generation?.id ?? null,
      briefVariant: variant.label || null,
      suggestedSendAt: output.suggestedSendAt || null,
    },
  };
}
