// Landing page block model shared by the page builder, the live preview and the public /p/<slug> renderer.
// Pure: no React, no database. A block is { id, type, props }.

export const BLOCK_TYPES = [
  { type: "hero", label: "Hero", description: "Headline, supporting line and a call to action." },
  { type: "text", label: "Text", description: "A heading and paragraphs." },
  { type: "image", label: "Image", description: "One image with alt text and an optional caption." },
  { type: "form", label: "Form", description: "One of your forms, submitting straight into your audience." },
  { type: "features", label: "Features", description: "Two to six short points in a grid." },
  { type: "cta", label: "Call to action", description: "A closing prompt with one button." },
];

export const BLOCK_LABEL = Object.fromEntries(BLOCK_TYPES.map((b) => [b.type, b.label]));

export const PAGE_TEMPLATES = [
  { value: "blank", label: "Blank" },
  { value: "lead_capture", label: "Lead capture" },
  { value: "webinar", label: "Webinar" },
  { value: "product", label: "Product launch" },
];

export const TEMPLATE_LABEL = Object.fromEntries(PAGE_TEMPLATES.map((t) => [t.value, t.label]));

function shortId() {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const DEFAULT_PROPS = {
  hero: { eyebrow: "", heading: "A clear promise in one line", subheading: "One or two sentences on who this is for and what they get.", ctaLabel: "", ctaHref: "#form", imageUrl: "", imageAlt: "", align: "left" },
  text: { heading: "", body: "Write a short paragraph here.\n\nLeave a blank line between paragraphs." },
  image: { url: "", alt: "", caption: "" },
  form: { formId: "", heading: "Get the details", description: "" },
  features: {
    heading: "What you get",
    items: [
      { title: "First point", body: "One sentence that explains it." },
      { title: "Second point", body: "One sentence that explains it." },
      { title: "Third point", body: "One sentence that explains it." },
    ],
  },
  cta: { heading: "Ready when you are", body: "", buttonLabel: "Get started", buttonHref: "#form" },
};

export function newBlock(type, props = {}) {
  return { id: shortId(), type, props: { ...structuredClone(DEFAULT_PROPS[type] || {}), ...props } };
}

export function templateBlocks(template, { formId = "" } = {}) {
  switch (template) {
    case "lead_capture":
      return [
        newBlock("hero", { eyebrow: "Free guide", heading: "The playbook our clients ask for", subheading: "Twenty pages of what works, delivered to your inbox.", ctaLabel: "Send me the guide", ctaHref: "#form" }),
        newBlock("features", { heading: "Inside the guide" }),
        newBlock("form", { formId, heading: "Where should we send it?" }),
      ];
    case "webinar":
      return [
        newBlock("hero", { eyebrow: "Live session", heading: "Join us live", subheading: "45 minutes, one topic, time for your questions.", ctaLabel: "Save my seat", ctaHref: "#form" }),
        newBlock("text", { heading: "What we'll cover", body: "A short outline of the session.\n\nWho it's for and what they'll leave with." }),
        newBlock("form", { formId, heading: "Register" }),
      ];
    case "product":
      return [
        newBlock("hero", { eyebrow: "New", heading: "Meet the new release", subheading: "What it does, in one sentence.", ctaLabel: "Get early access", ctaHref: "#form" }),
        newBlock("image", { alt: "Product photo" }),
        newBlock("features", { heading: "Why it matters" }),
        newBlock("cta", { heading: "Be first in line", buttonLabel: "Join the list", buttonHref: "#form" }),
        newBlock("form", { formId, heading: "Join the list" }),
      ];
    default:
      return [newBlock("hero"), newBlock("form", { formId })];
  }
}

// One-line description of a block for the builder's outline.
export function blockSummary(block) {
  const p = block?.props || {};
  switch (block?.type) {
    case "hero":
    case "text":
    case "cta":
    case "features":
      return p.heading || p.body?.split("\n")[0] || "No heading";
    case "image":
      return p.alt || (p.url ? "Image" : "No image chosen");
    case "form":
      return p.heading || "Form";
    default:
      return "";
  }
}

// Form ids a page's blocks render (page-level form_id fills blocks without their own).
export function blockFormIds(blocks = [], pageFormId = null) {
  const ids = new Set();
  for (const b of blocks) {
    if (b.type !== "form") continue;
    const id = b.props?.formId || pageFormId;
    if (id) ids.add(id);
  }
  return [...ids];
}

export function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
