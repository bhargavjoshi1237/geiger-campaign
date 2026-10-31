// The email document model and its renderer (isomorphic, pure): the block schema the Email Builder edits
// ({ blocks: [{ id, type, props, visibleIf }], settings }) rendered to email-client-safe, table-based HTML
// with inline styles, a hidden preheader, a ≤600px responsive container, dark-mode overrides and a
// plain-text part. Used for the builder canvas/preview in the browser and for every send on the server.
// OWNER: Campaigns.
//
// Senders pass recipient links through mergeData: unsubscribe_url (required for marketing mail),
// preferences_url and view_in_browser_url; the automatic footer links to them.

import { applyMergeTags, systemMergeData } from "./merge_tags";
import { evaluateCondition, normalizeRule } from "./conditions";

export const BLOCK_LIBRARY = [
  { type: "heading", label: "Heading", description: "Title or section heading" },
  { type: "text", label: "Text", description: "Paragraphs with bold, italic and links" },
  { type: "image", label: "Image", description: "Picture with alt text and optional link" },
  { type: "button", label: "Button", description: "Call to action" },
  { type: "divider", label: "Divider", description: "Horizontal rule" },
  { type: "spacer", label: "Spacer", description: "Vertical space" },
  { type: "columns", label: "Columns", description: "Two or three columns that stack on mobile" },
  { type: "product", label: "Product", description: "Product card with price and button" },
  { type: "social", label: "Social links", description: "Links to your social profiles" },
  { type: "html", label: "HTML", description: "Custom HTML snippet" },
];

export const BLOCK_TYPES = BLOCK_LIBRARY.map((b) => b.type);
const LIBRARY = Object.fromEntries(BLOCK_LIBRARY.map((b) => [b.type, b]));

export const SOCIAL_NETWORKS = [
  { key: "website", label: "Website" },
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "x", label: "X" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "tiktok", label: "TikTok" },
  { key: "youtube", label: "YouTube" },
];
const NETWORK_LABEL = Object.fromEntries(SOCIAL_NETWORKS.map((n) => [n.key, n.label]));

export const FONT_OPTIONS = [
  { key: "", label: "Brand body font" },
  { key: "system", label: "System sans-serif", stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" },
  { key: "helvetica", label: "Helvetica / Arial", stack: "Helvetica, Arial, sans-serif" },
  { key: "verdana", label: "Verdana", stack: "Verdana, Geneva, sans-serif" },
  { key: "georgia", label: "Georgia", stack: "Georgia, 'Times New Roman', serif" },
  { key: "courier", label: "Courier", stack: "'Courier New', Courier, monospace" },
];
const FONT_STACK = Object.fromEntries(FONT_OPTIONS.filter((f) => f.stack).map((f) => [f.key, f.stack]));

// Empty strings fall through to the brand kit, then to these built-ins.
export const DEFAULT_SETTINGS = {
  width: 600,
  backgroundColor: "",
  contentBackground: "",
  textColor: "",
  headingColor: "",
  linkColor: "",
  buttonColor: "",
  fontFamily: "",
  radius: 8,
  includeFooter: true,
  footerText: "",
  darkMode: true,
};

const BUILT_IN = {
  backgroundColor: "#f4f4f5",
  contentBackground: "#ffffff",
  textColor: "#3f3f46",
  headingColor: "#09090b",
  mutedColor: "#71717a",
  linkColor: "#2563eb",
  buttonColor: "#18181b",
  buttonText: "#ffffff",
  ruleColor: "#e4e4e7",
};

// Dark-mode palette applied through prefers-color-scheme (and Outlook.com's data-ogsc) on default surfaces.
const DARK = { body: "#111113", card: "#1c1c1f", text: "#e4e4e7", heading: "#fafafa", muted: "#a1a1aa", rule: "#3f3f46" };

const BLOCK_DEFAULTS = {
  heading: () => ({ text: "Add a headline", level: 1, align: "left", color: "", padding: 12 }),
  text: () => ({ text: "Write your message here.", align: "left", fontSize: 16, color: "", padding: 8 }),
  image: () => ({ src: "", darkSrc: "", alt: "", href: "", width: 0, align: "center", radius: 0, padding: 12 }),
  button: () => ({ label: "Read more", href: "", align: "left", color: "", textColor: "", radius: 6, fullWidth: false, padding: 12 }),
  divider: () => ({ color: "", thickness: 1, padding: 16 }),
  spacer: () => ({ height: 24 }),
  columns: () => ({ count: 2, gap: 16, padding: 12, columns: [{ blocks: [] }, { blocks: [] }] }),
  product: () => ({
    imageUrl: "",
    name: "Product name",
    description: "",
    price: "",
    compareAtPrice: "",
    currency: "USD",
    href: "",
    buttonLabel: "Shop now",
    layout: "stacked",
    padding: 12,
  }),
  social: () => ({ align: "center", useBrand: true, links: [], padding: 16 }),
  html: () => ({ html: "", padding: 8 }),
};

// Small ids are enough: they only need to be unique within one document.
let counter = 0;
export function newBlockId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  counter += 1;
  return `blk_${uuid ? uuid.slice(0, 8) : `${Date.now().toString(36)}${counter}`}`;
}

export function createBlock(type, props = {}) {
  const make = BLOCK_DEFAULTS[type] || BLOCK_DEFAULTS.text;
  const block = { id: newBlockId(), type: BLOCK_DEFAULTS[type] ? type : "text", props: { ...make(), ...props } };
  if (block.type === "columns") {
    const count = block.props.count === 3 ? 3 : 2;
    const existing = Array.isArray(props.columns) ? props.columns : [];
    block.props.columns = Array.from({ length: count }, (_, i) => ({
      blocks: Array.isArray(existing[i]?.blocks) ? existing[i].blocks : [createBlock("text", { text: "Column text." })],
    }));
  }
  return block;
}

// Deep copy with fresh ids (duplicate, insert a saved block).
export function cloneBlock(block) {
  const copy = JSON.parse(JSON.stringify(block || {}));
  const reid = (b) => {
    b.id = newBlockId();
    if (b.type === "columns") for (const col of b.props?.columns || []) for (const child of col.blocks || []) reid(child);
    return b;
  };
  return reid(copy);
}

export function blockLabel(type) {
  return LIBRARY[type]?.label || "Block";
}

export function emptyDocument() {
  return { version: 1, blocks: [], settings: { ...DEFAULT_SETTINGS } };
}

export function normalizeDocument(doc) {
  const d = doc && typeof doc === "object" ? doc : {};
  const blocks = (Array.isArray(d.blocks) ? d.blocks : []).filter((b) => b && BLOCK_DEFAULTS[b.type]);
  return {
    version: 1,
    blocks: blocks.map((b) => ({ ...b, id: b.id || newBlockId(), props: { ...BLOCK_DEFAULTS[b.type](), ...(b.props || {}) } })),
    settings: { ...DEFAULT_SETTINGS, ...(d.settings && typeof d.settings === "object" ? d.settings : {}) },
  };
}

// Every block, including the ones nested in columns: fn(block, parent).
export function walkBlocks(doc, fn) {
  const visit = (blocks, parent) => {
    for (const b of blocks || []) {
      fn(b, parent);
      if (b?.type === "columns") for (const col of b.props?.columns || []) visit(col.blocks, b);
    }
  };
  visit(doc?.blocks, null);
}

export function blockRule(block) {
  return normalizeRule(block?.visibleIf ?? block?.props?.visibleIf);
}

export function documentIsEmpty(doc) {
  return !(Array.isArray(doc?.blocks) && doc.blocks.length);
}

// The review checklist's compliance check: the automatic footer, or an explicit {{unsubscribe_url}}.
export function hasUnsubscribeLink(doc) {
  if (!doc || typeof doc !== "object") return false;
  if (doc.settings?.includeFooter !== false) return true;
  return JSON.stringify(doc.blocks || []).includes("unsubscribe_url");
}

// Brand kit in either the settings shape (getWorkspaceSettings().branding) or a raw brand_kits row.
export function normalizeBrand(brand) {
  const b = brand && typeof brand === "object" ? brand : {};
  const pick = (...keys) => {
    for (const k of keys) if (b[k] != null && b[k] !== "") return b[k];
    return "";
  };
  const raw = b.socialLinks ?? b.social_links ?? {};
  const socialLinks = Array.isArray(raw)
    ? Object.fromEntries(raw.filter((l) => l?.network && l?.url).map((l) => [l.network, l.url]))
    : raw && typeof raw === "object"
      ? raw
      : {};
  return {
    name: pick("companyName", "company_name"),
    logoUrl: pick("logoUrl", "logo_url"),
    logoDarkUrl: pick("logoDarkUrl", "logo_dark_url"),
    primaryColor: pick("primaryColor", "primary_color"),
    accentColor: pick("accentColor", "accent_color"),
    textColor: pick("textColor", "text_color"),
    backgroundColor: pick("backgroundColor", "background_color"),
    fontHeading: pick("fontHeading", "font_heading"),
    fontBody: pick("fontBody", "font_body"),
    footerText: pick("footerText", "footer_text"),
    address: pick("address", "companyAddress", "company_address"),
    socialLinks,
  };
}

// Escaping and sanitizing ------------------------------------------------------

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const unescapeHtml = (value) =>
  String(value ?? "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

function safeColor(value, fallback) {
  const v = String(value ?? "").trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v) || /^rgba?\([\d\s.,%]+\)$/i.test(v) || /^[a-z]{3,20}$/i.test(v)) return v;
  return fallback;
}

function safeFontName(value) {
  return String(value ?? "").replace(/[^\w\s-]/g, "").trim();
}

const clamp = (n, min, max, fallback) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
};

// Merge first, then allow only absolute web, mail and phone links.
function safeUrl(value, data) {
  const resolved = applyMergeTags(unescapeHtml(value), data).trim();
  if (/^(https?:\/\/|mailto:|tel:)/i.test(resolved)) return resolved;
  return "#";
}

function safeSrc(value, data) {
  const resolved = applyMergeTags(unescapeHtml(value), data).trim();
  if (/^https?:\/\//i.test(resolved) || /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(resolved)) return resolved;
  return "";
}

function stripUnsafeHtml(html) {
  return String(html ?? "")
    .replace(/<(script|iframe|object|embed|form)[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|iframe|object|embed|form|meta|link|base)\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
}

// Text formatting: **bold**, *italic*, [label](url), blank-line paragraphs and line breaks.
function formatInline(text, ctx) {
  const escaped = escapeHtml(text);
  const linkStyle = `color:${ctx.linkColor};text-decoration:underline;`;
  return escaped
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => `<a href="${escapeHtml(safeUrl(href, ctx.data))}" target="_blank" style="${linkStyle}">${label}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong style="font-weight:700;">$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/\n/g, "<br>");
}

function mergeHtml(html, ctx) {
  return applyMergeTags(html, ctx.data, { escape: escapeHtml });
}

function richText(text, ctx) {
  const paragraphs = String(text ?? "").replace(/\r\n/g, "\n").split(/\n{2,}/);
  return paragraphs
    .map((p, i) => `<p style="margin:0 0 ${i === paragraphs.length - 1 ? 0 : 16}px 0;">${mergeHtml(formatInline(p, ctx), ctx)}</p>`)
    .join("");
}

function plainText(text, data) {
  return applyMergeTags(
    String(text ?? "")
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1 ($2)")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2"),
    data,
  ).trim();
}

// Rendering ------------------------------------------------------------------

function buildContext(settingsInput, brandInput, data, opts = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...(settingsInput || {}) };
  const brand = normalizeBrand(brandInput);
  const fontName = safeFontName(brand.fontBody);
  const headingName = safeFontName(brand.fontHeading);
  const font = FONT_STACK[settings.fontFamily] || (fontName ? `'${fontName}', Helvetica, Arial, sans-serif` : FONT_STACK.system);
  const headingFont = settings.fontFamily
    ? font
    : headingName
      ? `'${headingName}', Helvetica, Arial, sans-serif`
      : font;
  const width = clamp(settings.width, 320, 600, 600);
  return {
    data,
    brand,
    settings,
    width,
    inner: width - 48,
    font,
    headingFont,
    background: safeColor(settings.backgroundColor, "") || safeColor(brand.backgroundColor, "") || BUILT_IN.backgroundColor,
    card: safeColor(settings.contentBackground, "") || BUILT_IN.contentBackground,
    text: safeColor(settings.textColor, "") || safeColor(brand.textColor, "") || BUILT_IN.textColor,
    heading: safeColor(settings.headingColor, "") || safeColor(brand.textColor, "") || BUILT_IN.headingColor,
    muted: BUILT_IN.mutedColor,
    linkColor: safeColor(settings.linkColor, "") || safeColor(brand.primaryColor, "") || BUILT_IN.linkColor,
    buttonColor: safeColor(settings.buttonColor, "") || safeColor(brand.primaryColor, "") || BUILT_IN.buttonColor,
    radius: clamp(settings.radius, 0, 24, 8),
    placeholders: !!opts.placeholders,
    showAll: !!opts.showAllBlocks,
    nested: false,
  };
}

const ALIGN = (a) => (a === "center" || a === "right" ? a : "left");
const MARGIN = { left: "0", center: "0 auto", right: "0 0 0 auto" };

function placeholder(label, height, ctx) {
  if (!ctx.placeholders) return "";
  return `<div style="height:${height}px;line-height:${height}px;background-color:#e4e4e7;color:#71717a;font-family:${ctx.font};font-size:13px;text-align:center;border-radius:6px;">${escapeHtml(label)}</div>`;
}

function renderHeading(p, ctx) {
  const level = [1, 2, 3].includes(Number(p.level)) ? Number(p.level) : 1;
  const [size, line] = { 1: [28, 34], 2: [22, 28], 3: [18, 24] }[level];
  const custom = safeColor(p.color, "");
  const cls = `${custom ? "" : "gx-heading "}${level === 1 ? "gx-h1" : ""}`.trim();
  return `<h${level} class="${cls}" style="margin:0;font-family:${ctx.headingFont};font-size:${size}px;line-height:${line}px;font-weight:700;color:${custom || ctx.heading};text-align:${ALIGN(p.align)};mso-line-height-rule:exactly;">${mergeHtml(formatInline(p.text, ctx), ctx)}</h${level}>`;
}

function renderText(p, ctx) {
  const size = clamp(p.fontSize, 12, 22, 16);
  const custom = safeColor(p.color, "");
  return `<div class="${custom ? "" : "gx-text"}" style="font-family:${ctx.font};font-size:${size}px;line-height:${Math.round(size * 1.5)}px;color:${custom || ctx.text};text-align:${ALIGN(p.align)};mso-line-height-rule:exactly;">${richText(p.text, ctx)}</div>`;
}

function imageTag(src, p, ctx, cls) {
  const width = p.width ? clamp(p.width, 40, ctx.inner, ctx.inner) : ctx.inner;
  const radius = clamp(p.radius, 0, 32, 0);
  return `<img src="${escapeHtml(src)}" alt="${escapeHtml(applyMergeTags(p.alt, ctx.data))}" width="${width}" class="gx-img ${cls}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;outline:none;text-decoration:none;border-radius:${radius}px;">`;
}

function renderImage(p, ctx) {
  const src = safeSrc(p.src, ctx.data);
  if (!src) return placeholder("Add an image", 160, ctx);
  const dark = safeSrc(p.darkSrc, ctx.data);
  let img = imageTag(src, p, ctx, dark ? "gx-light-only" : "");
  if (dark) {
    img += `<!--[if !mso]><!--><div class="gx-dark-only" style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${imageTag(dark, p, ctx, "")}</div><!--<![endif]-->`;
  }
  if (p.href) img = `<a href="${escapeHtml(safeUrl(p.href, ctx.data))}" target="_blank" style="text-decoration:none;">${img}</a>`;
  const align = ALIGN(p.align);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${align}" style="margin:${MARGIN[align]};"><tr><td>${img}</td></tr></table>`;
}

function buttonTable({ label, href, align, color, textColor, radius, fullWidth }, ctx) {
  const bg = safeColor(color, "") || ctx.buttonColor;
  const fg = safeColor(textColor, "") || BUILT_IN.buttonText;
  const r = clamp(radius, 0, 32, 6);
  const a = ALIGN(align);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${a}"${fullWidth ? ' width="100%"' : ""} style="margin:${MARGIN[a]};"><tr><td align="center" bgcolor="${bg}" style="border-radius:${r}px;background-color:${bg};mso-padding-alt:12px 24px;"><a href="${escapeHtml(safeUrl(href, ctx.data))}" target="_blank" style="display:${fullWidth ? "block" : "inline-block"};padding:12px 24px;font-family:${ctx.font};font-size:16px;line-height:20px;font-weight:600;color:${fg};text-decoration:none;text-align:center;border-radius:${r}px;">${mergeHtml(escapeHtml(label || "Button"), ctx)}</a></td></tr></table>`;
}

function renderDivider(p, ctx) {
  const color = safeColor(p.color, "");
  const t = clamp(p.thickness, 1, 8, 1);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="${color ? "" : "gx-rule"}" style="border-top:${t}px solid ${color || BUILT_IN.ruleColor};font-size:1px;line-height:1px;">&nbsp;</td></tr></table>`;
}

function formatPrice(value, currency) {
  if (value === "" || value == null) return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(n);
  } catch {
    return String(value);
  }
}

function renderProduct(p, ctx) {
  const src = safeSrc(p.imageUrl, ctx.data);
  const img = src
    ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(applyMergeTags(p.name, ctx.data))}" width="${p.layout === "side" ? 200 : ctx.inner}" class="gx-img" style="display:block;width:100%;height:auto;border:0;border-radius:${ctx.radius}px;">`
    : placeholder("Product image", p.layout === "side" ? 140 : 200, ctx);
  const linked = src && p.href ? `<a href="${escapeHtml(safeUrl(p.href, ctx.data))}" target="_blank">${img}</a>` : img;
  const price = formatPrice(applyMergeTags(p.price, ctx.data), p.currency);
  const compare = formatPrice(applyMergeTags(p.compareAtPrice, ctx.data), p.currency);
  const details = [
    `<p class="gx-heading" style="margin:0 0 4px 0;font-family:${ctx.headingFont};font-size:18px;line-height:24px;font-weight:700;color:${ctx.heading};">${mergeHtml(escapeHtml(p.name), ctx)}</p>`,
    p.description ? `<p class="gx-muted" style="margin:0 0 8px 0;font-family:${ctx.font};font-size:14px;line-height:21px;color:${ctx.muted};">${mergeHtml(formatInline(p.description, ctx), ctx)}</p>` : "",
    price
      ? `<p class="gx-text" style="margin:0 0 12px 0;font-family:${ctx.font};font-size:16px;line-height:22px;font-weight:600;color:${ctx.text};">${escapeHtml(price)}${compare ? ` <span class="gx-muted" style="font-weight:400;color:${ctx.muted};text-decoration:line-through;">${escapeHtml(compare)}</span>` : ""}</p>`
      : "",
    p.buttonLabel ? buttonTable({ label: p.buttonLabel, href: p.href, align: "left", radius: 6 }, ctx) : "",
  ].join("");
  if (p.layout === "side") {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="gx-stack gx-stack-gap" width="40%" valign="top" style="width:40%;padding-right:16px;">${linked}</td><td class="gx-stack" width="60%" valign="top" style="width:60%;">${details}</td></tr></table>`;
  }
  return `${linked ? `<div style="margin-bottom:12px;">${linked}</div>` : ""}${details}`;
}

function socialLinks(p, ctx) {
  const own = (Array.isArray(p.links) ? p.links : []).filter((l) => l?.url);
  if (own.length) return own;
  if (p.useBrand === false) return [];
  return Object.entries(ctx.brand.socialLinks || {})
    .filter(([, url]) => url)
    .map(([network, url]) => ({ network, url }));
}

function renderSocial(p, ctx) {
  const links = socialLinks(p, ctx);
  if (!links.length) return placeholder("Add social links or set them in the brand kit", 40, ctx);
  const items = links
    .map((l) => `<a href="${escapeHtml(safeUrl(l.url, ctx.data))}" target="_blank" class="gx-muted" style="color:${ctx.muted};font-family:${ctx.font};font-size:14px;line-height:20px;font-weight:600;text-decoration:none;">${escapeHtml(NETWORK_LABEL[l.network] || l.network)}</a>`)
    .join(`<span class="gx-muted" style="color:${ctx.muted};">&nbsp;&nbsp;&middot;&nbsp;&nbsp;</span>`);
  return `<div style="text-align:${ALIGN(p.align)};">${items}</div>`;
}

function renderHtmlBlock(p, ctx) {
  const html = stripUnsafeHtml(p.html);
  if (!html.trim()) return placeholder("Add custom HTML", 60, ctx);
  return mergeHtml(html, ctx);
}

function renderColumns(p, ctx) {
  const cols = (Array.isArray(p.columns) ? p.columns : []).slice(0, p.count === 3 ? 3 : 2);
  if (!cols.length) return "";
  const pct = Math.floor(100 / cols.length);
  const gap = clamp(p.gap, 0, 48, 16);
  const child = { ...ctx, nested: true, inner: Math.floor((ctx.inner - gap * (cols.length - 1)) / cols.length) };
  const cells = cols
    .map((col, i) => {
      const left = i === 0 ? 0 : Math.round(gap / 2);
      const right = i === cols.length - 1 ? 0 : Math.round(gap / 2);
      const rows = (col.blocks || []).map((b) => renderRow(b, child)).join("");
      return `<td class="gx-stack gx-stack-gap" width="${pct}%" valign="top" style="width:${pct}%;padding:0 ${right}px 0 ${left}px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows || `<tr><td>${placeholder("Empty column", 60, ctx)}</td></tr>`}</table></td>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>`;
}

const RENDERERS = {
  heading: renderHeading,
  text: renderText,
  image: renderImage,
  button: (p, ctx) => buttonTable(p, ctx),
  divider: renderDivider,
  product: renderProduct,
  social: renderSocial,
  html: renderHtmlBlock,
  columns: renderColumns,
};

export function isBlockVisible(block, data, { showAllBlocks = false } = {}) {
  if (showAllBlocks) return true;
  const rule = blockRule(block);
  return rule ? evaluateCondition(rule, data) : true;
}

function renderRow(block, ctx) {
  if (!block || !BLOCK_DEFAULTS[block.type]) return "";
  if (!isBlockVisible(block, ctx.data, { showAllBlocks: ctx.showAll })) return "";
  const p = { ...BLOCK_DEFAULTS[block.type](), ...(block.props || {}) };
  if (block.type === "spacer") {
    const h = clamp(p.height, 4, 120, 24);
    return `<tr><td style="height:${h}px;line-height:${h}px;font-size:0;mso-line-height-rule:exactly;">&nbsp;</td></tr>`;
  }
  if (ctx.nested && block.type === "columns") return "";
  const inner = RENDERERS[block.type](p, ctx);
  if (!inner) return "";
  const pad = clamp(p.padding, 0, 64, 8);
  const x = ctx.nested ? 0 : 24;
  const bg = safeColor(p.background, "");
  return `<tr><td class="${ctx.nested ? "" : "gx-pad"}"${bg ? ` bgcolor="${bg}"` : ""} style="padding:${ctx.nested ? Math.min(pad, 8) : pad}px ${x}px;${bg ? `background-color:${bg};` : ""}">${inner}</td></tr>`;
}

function footerHtml(ctx) {
  if (ctx.settings.includeFooter === false) return "";
  const text = ctx.settings.footerText || ctx.brand.footerText;
  const lines = [];
  if (text) lines.push(mergeHtml(formatInline(text, ctx), ctx));
  const company = [ctx.brand.name, ctx.brand.address].filter(Boolean).map(escapeHtml).join(" &middot; ");
  if (company) lines.push(company);
  const link = (label, key) => `<a href="${escapeHtml(safeUrl(`{{${key}}}`, ctx.data))}" target="_blank" class="gx-muted" style="color:${ctx.muted};text-decoration:underline;">${label}</a>`;
  const links = [link("Unsubscribe", "unsubscribe_url")];
  if (ctx.data.preferences_url) links.push(link("Manage preferences", "preferences_url"));
  if (ctx.data.view_in_browser_url) links.push(link("View in browser", "view_in_browser_url"));
  lines.push(links.join(" &middot; "));
  return `<table role="presentation" class="gx-container" width="${ctx.width}" cellpadding="0" cellspacing="0" border="0" style="width:${ctx.width}px;max-width:${ctx.width}px;"><tr><td class="gx-pad gx-muted" style="padding:24px;font-family:${ctx.font};font-size:12px;line-height:18px;color:${ctx.muted};text-align:center;">${lines.join("<br>")}</td></tr></table>`;
}

function headStyles(ctx) {
  const dark = ctx.settings.darkMode === false
    ? ""
    : `@media (prefers-color-scheme: dark) {
  .gx-body { background-color:${DARK.body} !important; }
  .gx-card { background-color:${DARK.card} !important; }
  .gx-text, .gx-text p { color:${DARK.text} !important; }
  .gx-heading { color:${DARK.heading} !important; }
  .gx-muted { color:${DARK.muted} !important; }
  .gx-rule { border-color:${DARK.rule} !important; }
  .gx-light-only { display:none !important; max-height:0 !important; overflow:hidden !important; }
  .gx-dark-only { display:block !important; max-height:none !important; }
}
[data-ogsc] .gx-text, [data-ogsc] .gx-text p { color:${DARK.text} !important; }
[data-ogsc] .gx-heading { color:${DARK.heading} !important; }
[data-ogsc] .gx-muted { color:${DARK.muted} !important; }
[data-ogsb] .gx-body { background-color:${DARK.body} !important; }
[data-ogsb] .gx-card { background-color:${DARK.card} !important; }`;
  return `:root { color-scheme: light${ctx.settings.darkMode === false ? "" : " dark"}; supported-color-schemes: light${ctx.settings.darkMode === false ? "" : " dark"}; }
body { margin:0 !important; padding:0 !important; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
table, td { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
a[x-apple-data-detectors] { color:inherit !important; text-decoration:none !important; }
@media only screen and (max-width:${ctx.width + 20}px) {
  .gx-container { width:100% !important; max-width:100% !important; }
  .gx-pad { padding-left:16px !important; padding-right:16px !important; }
  .gx-stack { display:block !important; width:100% !important; max-width:100% !important; }
  .gx-stack-gap { padding-left:0 !important; padding-right:0 !important; padding-bottom:16px !important; }
  .gx-img { width:100% !important; max-width:100% !important; height:auto !important; }
  .gx-h1 { font-size:24px !important; line-height:30px !important; }
}
${dark}`;
}

function preheaderHtml(text) {
  if (!text) return "";
  // Trailing zero-width padding keeps inbox previews from pulling in body copy.
  const pad = "&#8199;&#65279;&#847; ".repeat(60);
  return `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(text)}${pad}</div>`;
}

function blockText(block, ctx) {
  if (!isBlockVisible(block, ctx.data, { showAllBlocks: ctx.showAll })) return "";
  const p = { ...(BLOCK_DEFAULTS[block.type]?.() || {}), ...(block.props || {}) };
  const data = ctx.data;
  switch (block.type) {
    case "heading":
      return plainText(p.text, data).toUpperCase();
    case "text":
      return plainText(p.text, data);
    case "image": {
      const alt = applyMergeTags(p.alt, data).trim();
      const href = p.href ? safeUrl(p.href, data) : "";
      return alt ? (href && href !== "#" ? `${alt}: ${href}` : `[${alt}]`) : "";
    }
    case "button": {
      const href = safeUrl(p.href, data);
      return `${applyMergeTags(p.label, data)}${href !== "#" ? `: ${href}` : ""}`;
    }
    case "divider":
      return "----------";
    case "product": {
      const price = formatPrice(applyMergeTags(p.price, data), p.currency);
      const href = p.href ? safeUrl(p.href, data) : "";
      return [applyMergeTags(p.name, data), plainText(p.description, data), price, href !== "#" ? href : ""].filter(Boolean).join("\n");
    }
    case "social":
      return socialLinks(p, ctx).map((l) => `${NETWORK_LABEL[l.network] || l.network}: ${safeUrl(l.url, data)}`).join("\n");
    case "html":
      return applyMergeTags(stripUnsafeHtml(p.html).replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|h\d)>/gi, "\n").replace(/<[^>]+>/g, ""), data)
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    case "columns":
      return (p.columns || []).map((col) => (col.blocks || []).map((b) => blockText(b, ctx)).filter(Boolean).join("\n\n")).filter(Boolean).join("\n\n");
    default:
      return "";
  }
}

function footerText(ctx) {
  if (ctx.settings.includeFooter === false) return "";
  const lines = [];
  const text = ctx.settings.footerText || ctx.brand.footerText;
  if (text) lines.push(plainText(text, ctx.data));
  const company = [ctx.brand.name, ctx.brand.address].filter(Boolean).join(" · ");
  if (company) lines.push(company);
  const unsub = safeUrl("{{unsubscribe_url}}", ctx.data);
  lines.push(`Unsubscribe: ${unsub === "#" ? "(link added at send)" : unsub}`);
  if (ctx.data.preferences_url) lines.push(`Manage preferences: ${safeUrl("{{preferences_url}}", ctx.data)}`);
  return lines.join("\n");
}

// One block as a standalone table fragment, for the builder canvas and block previews.
export function renderBlockHtml(block, { mergeData = {}, brand = {}, settings = {}, placeholders = true, showAllBlocks = true, nested = false } = {}) {
  const data = { ...systemMergeData(), ...(mergeData || {}) };
  const ctx = buildContext(settings, brand, data, { placeholders, showAllBlocks });
  if (nested) Object.assign(ctx, { nested: true, inner: Math.floor(ctx.inner / 2) });
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${ctx.font};">${renderRow(block, ctx)}</table>`;
}

// The full email. Options beyond the contract: subject (sets <title>), placeholders (preview boxes for
// empty images), showAllBlocks (ignore display rules), lang.
export function renderEmailDocument(doc, { mergeData = {}, brand = {}, preheader = "", subject = "", placeholders = false, showAllBlocks = false, lang = "en" } = {}) {
  const normalized = normalizeDocument(doc);
  const data = { ...systemMergeData(), ...(mergeData || {}) };
  const ctx = buildContext(normalized.settings, brand, data, { placeholders, showAllBlocks });
  const hiddenBlockIds = [];
  walkBlocks(normalized, (b) => {
    if (!isBlockVisible(b, data, { showAllBlocks })) hiddenBlockIds.push(b.id);
  });
  const rows = normalized.blocks.map((b) => renderRow(b, ctx)).join("");
  const preview = applyMergeTags(preheader, data);
  const title = escapeHtml(applyMergeTags(subject, data));
  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="${escapeHtml(lang)}" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
<meta name="color-scheme" content="${ctx.settings.darkMode === false ? "light" : "light dark"}">
<meta name="supported-color-schemes" content="${ctx.settings.darkMode === false ? "light" : "light dark"}">
<title>${title}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
${headStyles(ctx)}
</style>
</head>
<body class="gx-body" style="margin:0;padding:0;background-color:${ctx.background};">
${preheaderHtml(preview)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="gx-body" bgcolor="${ctx.background}" style="background-color:${ctx.background};">
<tr><td align="center" style="padding:24px 12px;">
<!--[if mso]><table role="presentation" width="${ctx.width}" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" class="gx-container gx-card" width="${ctx.width}" cellpadding="0" cellspacing="0" border="0" bgcolor="${ctx.card}" style="width:${ctx.width}px;max-width:${ctx.width}px;background-color:${ctx.card};border-radius:${ctx.radius}px;font-family:${ctx.font};">
<tr><td style="height:16px;line-height:16px;font-size:0;">&nbsp;</td></tr>
${rows}
<tr><td style="height:16px;line-height:16px;font-size:0;">&nbsp;</td></tr>
</table>
${footerHtml(ctx)}
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
  const parts = normalized.blocks.map((b) => blockText(b, ctx)).filter(Boolean);
  const foot = footerText(ctx);
  const text = [...parts, foot ? `--\n${foot}` : ""].filter(Boolean).join("\n\n");
  return { html, text, hiddenBlockIds };
}

// Resolved page/content colours and width, for editors that draw the canvas around block fragments.
export function documentSurface(settings, brand) {
  const ctx = buildContext(settings, brand, {});
  return { background: ctx.background, card: ctx.card, width: ctx.width, radius: ctx.radius, font: ctx.font };
}
