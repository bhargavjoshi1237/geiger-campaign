// Brand kit model shared by the Brand Kit / Branding screens, hosted pages (forms, landing pages, surveys)
// and server email rendering. Pure: no React, no database. One campaign.brand_kits row per project.

const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export const SOCIAL_KEYS = [
  { key: "website", label: "Website", placeholder: "https://example.com" },
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/yourbrand" },
  { key: "facebook", label: "Facebook", placeholder: "https://facebook.com/yourbrand" },
  { key: "x", label: "X", placeholder: "https://x.com/yourbrand" },
  { key: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/company/yourbrand" },
  { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@yourbrand" },
  { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/@yourbrand" },
];

const SANS = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
const SERIF = "ui-serif, Georgia, 'Times New Roman', serif";

// Fonts hosted pages can load from Google Fonts; "" keeps the visitor's system font.
export const FONT_OPTIONS = [
  { value: "", label: "System default", family: null, fallback: SANS },
  { value: "Inter", label: "Inter", family: "Inter:wght@400;500;600;700", fallback: SANS },
  { value: "Geist", label: "Geist", family: "Geist:wght@400;500;600;700", fallback: SANS },
  { value: "DM Sans", label: "DM Sans", family: "DM+Sans:wght@400;500;600;700", fallback: SANS },
  { value: "Manrope", label: "Manrope", family: "Manrope:wght@400;500;600;700", fallback: SANS },
  { value: "Work Sans", label: "Work Sans", family: "Work+Sans:wght@400;500;600;700", fallback: SANS },
  { value: "IBM Plex Sans", label: "IBM Plex Sans", family: "IBM+Plex+Sans:wght@400;500;600;700", fallback: SANS },
  { value: "Space Grotesk", label: "Space Grotesk", family: "Space+Grotesk:wght@400;500;600;700", fallback: SANS },
  { value: "Roboto", label: "Roboto", family: "Roboto:wght@400;500;700", fallback: SANS },
  { value: "Lora", label: "Lora", family: "Lora:wght@400;500;600;700", fallback: SERIF },
  { value: "Playfair Display", label: "Playfair Display", family: "Playfair+Display:wght@400;600;700", fallback: SERIF },
  { value: "Source Serif 4", label: "Source Serif 4", family: "Source+Serif+4:wght@400;600;700", fallback: SERIF },
];

const FONT_BY_VALUE = new Map(FONT_OPTIONS.map((f) => [f.value, f]));

export function fontStack(name) {
  const font = FONT_BY_VALUE.get(name || "");
  if (!font || !font.value) return null;
  return `'${font.value}', ${font.fallback}`;
}

// One Google Fonts stylesheet URL for the kit's heading + body fonts (only known families are loaded).
export function googleFontsHref(brand = {}) {
  const families = [...new Set([brand.fontHeading, brand.fontBody])]
    .map((name) => FONT_BY_VALUE.get(name || "")?.family)
    .filter(Boolean);
  if (!families.length) return null;
  return `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join("&")}&display=swap`;
}

export function isHexColor(value) {
  return typeof value === "string" && /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.test(value.trim());
}

export function normalizeHex(value) {
  const v = String(value || "").trim();
  if (!isHexColor(v)) return "";
  if (v.length === 4) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toUpperCase();
  return v.toUpperCase();
}

function luminance(hex) {
  const v = normalizeHex(hex);
  if (!v) return null;
  const channel = (i) => {
    const c = parseInt(v.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

// "white" or "black", whichever reads better on `hex` (WCAG contrast).
export function readableOn(hex) {
  const l = luminance(hex);
  if (l == null) return "white";
  const onWhite = 1.05 / (l + 0.05);
  const onBlack = (l + 0.05) / 0.05;
  return onWhite >= onBlack ? "white" : "black";
}

export const BRAND_DEFAULTS = {
  name: "Brand kit",
  logoUrl: "",
  logoDarkUrl: "",
  iconUrl: "",
  primaryColor: "",
  accentColor: "",
  textColor: "",
  backgroundColor: "",
  fontHeading: "",
  fontBody: "",
  voice: "",
  footerText: "",
  companyAddress: "",
  socialLinks: {},
  palette: [],
};

export function normalizeBrandKit(row) {
  if (!row) return null;
  const meta = bag(row.metadata);
  return {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? BRAND_DEFAULTS.name,
    logoUrl: row.logo_url ?? "",
    logoDarkUrl: row.logo_dark_url ?? "",
    iconUrl: row.icon_url ?? "",
    primaryColor: row.primary_color ?? "",
    accentColor: row.accent_color ?? "",
    textColor: row.text_color ?? "",
    backgroundColor: row.background_color ?? "",
    fontHeading: row.font_heading ?? "",
    fontBody: row.font_body ?? "",
    voice: row.voice ?? "",
    footerText: row.footer_text ?? "",
    companyAddress: row.company_address ?? "",
    socialLinks: bag(row.social_links),
    palette: Array.isArray(meta.palette) ? meta.palette : [],
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function brandKitToRow(input) {
  const row = {};
  const text = {
    name: "name",
    logoUrl: "logo_url",
    logoDarkUrl: "logo_dark_url",
    iconUrl: "icon_url",
    fontHeading: "font_heading",
    fontBody: "font_body",
    voice: "voice",
    footerText: "footer_text",
    companyAddress: "company_address",
  };
  for (const [key, col] of Object.entries(text)) if (key in input) row[col] = String(input[key] ?? "");
  for (const [key, col] of Object.entries({
    primaryColor: "primary_color",
    accentColor: "accent_color",
    textColor: "text_color",
    backgroundColor: "background_color",
  })) {
    if (key in input) row[col] = normalizeHex(input[key]);
  }
  if ("socialLinks" in input) row.social_links = bag(input.socialLinks);
  if ("createdBy" in input) row.created_by = input.createdBy ?? null;
  return row;
}

// A complete brand view with defaults, for renderers that must not branch on a missing row.
export function resolveBrand(kit, { fallbackName = "" } = {}) {
  return { ...BRAND_DEFAULTS, ...(kit || {}), displayName: fallbackName };
}

// CSS custom properties that re-skin the suite's semantic tokens with the brand on a hosted page.
// Background/text only apply together, so a kit without them keeps the visitor's light/dark theme.
export function brandCssVars(brand = {}) {
  const vars = {};
  const primary = normalizeHex(brand.primaryColor);
  if (primary) {
    vars["--primary"] = primary;
    vars["--primary-foreground"] = readableOn(primary);
    vars["--ring"] = primary;
  }
  const bg = normalizeHex(brand.backgroundColor);
  if (bg) {
    const text = normalizeHex(brand.textColor) || readableOn(bg);
    const mix = (pct) => `color-mix(in srgb, ${text} ${pct}%, ${bg})`;
    Object.assign(vars, {
      "--background": bg,
      "--foreground": text,
      "--card": bg,
      "--card-foreground": text,
      "--popover": bg,
      "--popover-foreground": text,
      "--muted-foreground": mix(64),
      "--text-secondary": mix(64),
      "--text-tertiary": mix(46),
      "--border": mix(14),
      "--border-strong": mix(24),
      "--input": mix(18),
      "--surface-subtle": mix(3),
      "--surface-card": mix(5),
      "--surface-hover": mix(8),
      "--surface-active": mix(11),
      colorScheme: (luminance(bg) ?? 1) < 0.35 ? "dark" : "light",
    });
  }
  const heading = fontStack(brand.fontHeading);
  const body = fontStack(brand.fontBody);
  if (heading) vars["--brand-font-heading"] = heading;
  if (body) vars.fontFamily = body;
  return vars;
}

// Inline-style colours for HTML email, where CSS variables and theme tokens don't exist.
export const EMAIL_FALLBACK = { primary: "#111827", text: "#111827", muted: "#6B7280", border: "#E5E7EB", background: "#FFFFFF" };

export function emailColors(brand = {}) {
  const primary = normalizeHex(brand.primaryColor) || EMAIL_FALLBACK.primary;
  return {
    primary,
    onPrimary: readableOn(primary) === "white" ? "#FFFFFF" : "#000000",
    text: EMAIL_FALLBACK.text,
    muted: EMAIL_FALLBACK.muted,
    border: EMAIL_FALLBACK.border,
    background: EMAIL_FALLBACK.background,
  };
}

// The public slice of a kit handed to the embed script and hosted pages.
export function publicBrand(brand = {}) {
  return {
    logoUrl: brand.logoUrl || "",
    logoDarkUrl: brand.logoDarkUrl || "",
    primaryColor: normalizeHex(brand.primaryColor),
    textColor: normalizeHex(brand.textColor),
    backgroundColor: normalizeHex(brand.backgroundColor),
    fontHeading: brand.fontHeading || "",
    fontBody: brand.fontBody || "",
    footerText: brand.footerText || "",
    companyAddress: brand.companyAddress || "",
  };
}
