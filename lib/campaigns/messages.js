import { renderEmailDocument } from "@/lib/email/blocks";
import { applyMergeTags, contactMergeData } from "@/lib/email/merge_tags";
import { prepareTrackedEmail, preferencesUrl, resolveUtm, unsubscribeUrl, webViewUrl } from "@/lib/email/tracking";
import { resolveVariant } from "./ab";
import { abPlan } from "./ab_send";

// Per-recipient message builders for the sender (server-only). Each returns the `message` callback
// dispatch() calls with the new delivery id, so tracking pixels, signed links and the unsubscribe
// footer can embed it. Email goes out pre-rendered through geiger-dash; other channels get text.

const slug = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "email";

function formatFrom(name, email) {
  if (!email) return undefined;
  const clean = String(name || "").replace(/["<>]/g, "").trim();
  if (!clean) return email;
  return /[,;:@()[\]\\]/.test(clean) ? `"${clean}" <${email}>` : `${clean} <${email}>`;
}

// Everything the builders need that doesn't vary per recipient.
export function messageContext(campaign, settings = {}, { connectionId = null } = {}) {
  const sending = settings.sending || {};
  const companyName = settings.branding?.companyName || settings.general?.name || "";
  const fromName = campaign.from_name || sending.fromName || companyName;
  return {
    campaign,
    settings,
    ab: abPlan(campaign),
    brand: { ...(settings.branding || {}), companyName },
    tracking: settings.tracking || {},
    utmConfig: campaign.metadata?.utm ?? settings.tracking?.utm ?? null,
    connectionId,
    companyName,
    from: formatFrom(fromName, campaign.from_email || sending.fromEmail || ""),
    label: `campaign.${slug(campaign.name)}`,
  };
}

// The raw variant row (for text-channel bodies the shared resolver doesn't carry).
function rawVariant(campaign, key) {
  if (!key || key === "A") return {};
  return (campaign.ab?.variants || []).find((v) => v?.key === key) || {};
}

export function campaignText(campaign, variantKey = null) {
  const content = campaign?.content || {};
  const raw = rawVariant(campaign, variantKey);
  return raw.body || raw.text || content.text || content.body || content.message || "";
}

// Renders the variant's email document (or a campaign's imported HTML) with merge data and branding.
export function renderCampaignHtml(campaign, variantKey, { mergeData = {}, brand = {}, preheader = "", subject = "" } = {}) {
  const variant = resolveVariant(campaign, variantKey);
  const doc = variant.content || {};
  if (!(Array.isArray(doc.blocks) && doc.blocks.length) && campaign.html) return applyMergeTags(campaign.html, mergeData);
  return renderEmailDocument(doc, { mergeData, brand, preheader, subject }).html;
}

// Text channels opt out by keyword (STOP), so they carry no signed links.
const NO_LINKS = { unsubscribe: "", preferences: "", webView: null };

function mergeDataFor(ctx, contact, links) {
  return {
    ...contactMergeData(contact || {}),
    unsubscribe_url: links.unsubscribe,
    preferences_url: links.preferences,
    ...(links.webView ? { view_in_browser_url: links.webView } : {}),
    campaign_name: ctx.campaign.name || "",
    company_name: ctx.companyName,
    company_address: ctx.brand.address || "",
  };
}

// One recipient's email: merge tags, render, then tracking + compliance (none for tests).
export function buildEmail(ctx, variantKey, mergeData, { deliveryId = null, links, test = false }) {
  const { campaign } = ctx;
  const variant = resolveVariant(campaign, variantKey);
  const subject = applyMergeTags(variant.subject, mergeData).trim();
  const preheader = applyMergeTags(variant.preheader || "", mergeData);
  let html;
  try {
    html = renderCampaignHtml(campaign, variantKey, { mergeData, brand: ctx.brand, preheader, subject });
  } catch (error) {
    console.error("[campaigns.messages.render]", error);
    return { subject, html: "", label: ctx.label };
  }
  const tracked = prepareTrackedEmail(html, {
    deliveryId: test ? null : deliveryId,
    unsubscribe: links.unsubscribe,
    skip: [links.preferences, links.webView],
    tracking: test ? { opens: false, clicks: false } : ctx.tracking,
    utm: resolveUtm(ctx.utmConfig, { campaignName: campaign.name, channel: "email", variant: ctx.ab ? variant.key : null }),
    footer: { companyName: ctx.companyName, address: ctx.brand.address || "", footerText: ctx.brand.footerText || "" },
  });
  return {
    subject: test ? `[Test] ${subject}` : subject,
    html: tracked,
    from: ctx.from,
    label: test ? `${ctx.label}.test` : ctx.label,
  };
}

function buildText(ctx, variantKey, mergeData) {
  const { campaign } = ctx;
  const content = campaign.content || {};
  let text = applyMergeTags(campaignText(campaign, variantKey), mergeData).trim();
  if (campaign.channel === "sms" && text && !/\bstop\b/i.test(text)) text = `${text}\n\nReply STOP to opt out.`;
  return {
    text,
    body: text,
    title: applyMergeTags(resolveVariant(campaign, variantKey).subject || "", mergeData),
    url: content.url || content.link || null,
    imageUrl: content.imageUrl || content.mediaUrl || null,
    template: content.template || null,
    variables: content.variables || null,
    label: ctx.label,
  };
}

export function recipientLinks({ deliveryId, contactId, projectId, campaignId }) {
  const ids = { deliveryId, contactId, projectId, campaignId };
  return { unsubscribe: unsubscribeUrl(ids), preferences: preferencesUrl(ids), webView: deliveryId ? webViewUrl(deliveryId) : null };
}

// The dispatch() message callback for one campaign recipient.
export function recipientMessage(ctx, contact, variantKey = null) {
  const { campaign } = ctx;
  return async ({ deliveryId }) => {
    if (campaign.channel !== "email") return buildText(ctx, variantKey, mergeDataFor(ctx, contact, NO_LINKS));
    const links = recipientLinks({ deliveryId, contactId: contact.id, projectId: campaign.project_id, campaignId: campaign.id });
    return buildEmail(ctx, variantKey, mergeDataFor(ctx, contact, links), { deliveryId, links });
  };
}

// The same email a delivery received, for the "view in browser" page (no pixel, links still tracked).
export function webViewHtml(ctx, contact, { deliveryId, variantKey = null }) {
  const { campaign } = ctx;
  const links = recipientLinks({ deliveryId, contactId: contact?.id || null, projectId: campaign.project_id, campaignId: campaign.id });
  const mergeData = mergeDataFor(ctx, contact, { ...links, webView: null });
  const message = buildEmail({ ...ctx, tracking: { ...ctx.tracking, opens: false } }, variantKey, mergeData, { deliveryId, links });
  return message.html;
}

// A test send: [Test] subject, sample-contact merge data, an inert unsubscribe link, no tracking.
export function testMessage(ctx, sampleContact, variantKey = null) {
  const { campaign } = ctx;
  return async () => {
    if (campaign.channel !== "email") {
      const message = buildText(ctx, variantKey, mergeDataFor(ctx, sampleContact, NO_LINKS));
      return { ...message, text: `[Test] ${message.text}`, body: `[Test] ${message.body}` };
    }
    const inert = unsubscribeUrl({ projectId: campaign.project_id, campaignId: campaign.id, test: true });
    const links = { unsubscribe: inert, preferences: inert, webView: null };
    return buildEmail(ctx, variantKey, mergeDataFor(ctx, sampleContact, links), { links, test: true });
  };
}

// The archived HTML snapshot stored on the campaign when sending starts (no recipient data).
export function snapshotHtml(campaign, settings = {}) {
  const doc = campaign.content || {};
  if (!(Array.isArray(doc.blocks) && doc.blocks.length)) return null;
  try {
    const companyName = settings.branding?.companyName || settings.general?.name || "";
    return renderEmailDocument(doc, {
      mergeData: {},
      brand: { ...(settings.branding || {}), companyName },
      preheader: campaign.preheader || "",
      subject: campaign.subject || "",
    }).html;
  } catch {
    return null;
  }
}
