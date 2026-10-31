import { signToken } from "@/lib/server/tokens";
import { publicUrl } from "@/lib/server/urls";

// Email tracking & compliance (server-only): signed open-pixel and click-redirect URLs, link rewriting
// with optional UTM tagging, and the CAN-SPAM/GDPR footer (postal address + signed unsubscribe link).
// Only signed URLs redirect, so the click route is never an open redirect. Tokens carry ids, never PII.

const HREF = /<a\b([^>]*?)\bhref\s*=\s*(["'])(.*?)\2([^>]*)>/gis;

const decodeEntities = (value) =>
  String(value)
    .replace(/&amp;/gi, "&")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#47;/g, "/")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");

const escapeAttr = (value) => String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export const openPixelUrl = (deliveryId) => publicUrl(`/api/t/o/${signToken({ k: "open", d: deliveryId })}`);
export const clickUrl = (deliveryId, url) => publicUrl(`/api/t/c/${signToken({ k: "click", d: deliveryId, u: url })}`);

// The recipient's preference centre; `test` tokens render a preview that changes nothing.
function preferenceToken({ deliveryId = null, contactId = null, projectId, campaignId = null, test = false }) {
  return signToken(test ? { k: "unsub", t: 1, p: projectId, m: campaignId } : { k: "unsub", d: deliveryId, c: contactId, p: projectId, m: campaignId });
}

export const unsubscribeUrl = (ids) => publicUrl(`/u/${preferenceToken(ids)}`);
export const preferencesUrl = (ids) => publicUrl(`/u/${preferenceToken(ids)}`, { manage: 1 });
export const webViewUrl = (deliveryId) => publicUrl(`/api/t/v/${signToken({ k: "view", d: deliveryId })}`);

// UTM config -> params. `true` uses the defaults; an object overrides them; false/null disables tagging.
export function resolveUtm(config, { campaignName = "", channel = "email", variant = null } = {}) {
  if (!config || config.enabled === false) return null;
  const slug = String(campaignName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const custom = typeof config === "object" ? config : {};
  return {
    utm_source: custom.source || "geiger",
    utm_medium: custom.medium || channel,
    utm_campaign: custom.campaign || slug || "campaign",
    ...(custom.content || variant ? { utm_content: custom.content || `variant-${String(variant).toLowerCase()}` } : {}),
    ...(custom.term ? { utm_term: custom.term } : {}),
  };
}

// Adds UTM params a link doesn't already carry.
export function withUtm(url, utm) {
  if (!utm) return url;
  try {
    const parsed = new URL(url);
    for (const [key, value] of Object.entries(utm)) if (value && !parsed.searchParams.has(key)) parsed.searchParams.set(key, value);
    return parsed.toString();
  } catch {
    return url;
  }
}

// Rewrites every http(s) href: UTM first, then the signed click redirect. Links marked
// data-gc-notrack and the skip list (unsubscribe/preferences) stay direct.
export function rewriteLinks(html, { deliveryId, trackClicks = true, utm = null, skip = [] } = {}) {
  const skipSet = new Set(skip.filter(Boolean));
  return String(html).replace(HREF, (match, before, quote, rawHref, after) => {
    const href = decodeEntities(rawHref.trim());
    if (!isHttpUrl(href) || skipSet.has(href) || /data-gc-notrack/i.test(before + after)) return match;
    const destination = withUtm(href, utm);
    const next = trackClicks && deliveryId ? clickUrl(deliveryId, destination) : destination;
    return `<a${before}href="${escapeAttr(next)}"${after}>`;
  });
}

function insertBeforeBodyEnd(html, fragment) {
  const source = String(html);
  const index = source.search(/<\/body>/i);
  return index === -1 ? `${source}${fragment}` : `${source.slice(0, index)}${fragment}${source.slice(index)}`;
}

export function injectOpenPixel(html, deliveryId) {
  const src = escapeAttr(openPixelUrl(deliveryId));
  return insertBeforeBodyEnd(
    html,
    `<img src="${src}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;margin:0;padding:0;overflow:hidden" />`,
  );
}

// Appends the compliance footer unless the rendered document already links the unsubscribe URL.
export function appendComplianceFooter(html, { unsubscribe, companyName = "", address = "", footerText = "", reason = "" }) {
  if (!unsubscribe || String(html).includes(unsubscribe) || String(html).includes(escapeAttr(unsubscribe))) return html;
  const lines = [
    footerText ? `<p style="margin:0 0 8px">${escapeHtml(footerText)}</p>` : "",
    reason ? `<p style="margin:0 0 8px">${escapeHtml(reason)}</p>` : "",
    companyName || address
      ? `<p style="margin:0 0 8px">${escapeHtml([companyName, address].filter(Boolean).join(" · "))}</p>`
      : "",
    `<p style="margin:0"><a href="${escapeAttr(unsubscribe)}" style="color:#6b7280;text-decoration:underline">Unsubscribe or manage preferences</a></p>`,
  ].join("");
  return insertBeforeBodyEnd(
    html,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:24px 16px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#6b7280">${lines}</td></tr></table>`,
  );
}

// The full post-render pass for one recipient's email.
export function prepareTrackedEmail(
  html,
  { deliveryId, unsubscribe = null, skip = [], tracking = { opens: true, clicks: true }, utm = null, footer = {} } = {},
) {
  let out = appendComplianceFooter(html, { ...footer, unsubscribe });
  out = rewriteLinks(out, { deliveryId, trackClicks: tracking?.clicks !== false, utm, skip: [unsubscribe, ...skip] });
  if (tracking?.opens !== false && deliveryId) out = injectOpenPixel(out, deliveryId);
  return out;
}
