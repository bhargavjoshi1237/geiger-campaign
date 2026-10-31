// Popup configuration model shared by the designer, the public popup API and (mirrored in vanilla JS)
// public/embed/v1.js. Pure: no React, no database.

export const POPUP_TRIGGERS = [
  { value: "exit_intent", label: "Exit intent", hint: "When the pointer leaves toward the browser bar (desktop); falls back to a 30s delay on touch devices." },
  { value: "scroll", label: "On scroll", hint: "After the visitor scrolls a percentage of the page." },
  { value: "delay", label: "Time delay", hint: "A number of seconds after the page loads." },
  { value: "click", label: "On click", hint: "When an element matching a CSS selector is clicked." },
];

export const TRIGGER_LABEL = Object.fromEntries(POPUP_TRIGGERS.map((t) => [t.value, t.label]));

export const POPUP_LAYOUTS = [
  { value: "modal", label: "Modal" },
  { value: "slide_in", label: "Slide-in" },
  { value: "banner", label: "Banner" },
];

export const LAYOUT_LABEL = Object.fromEntries(POPUP_LAYOUTS.map((l) => [l.value, l.label]));

export const POPUP_POSITIONS = {
  modal: [{ value: "center", label: "Centered" }],
  slide_in: [
    { value: "bottom_right", label: "Bottom right" },
    { value: "bottom_left", label: "Bottom left" },
  ],
  banner: [
    { value: "top", label: "Top of page" },
    { value: "bottom", label: "Bottom of page" },
  ],
};

export const POPUP_FREQUENCIES = [
  { value: "once", label: "Once per visitor" },
  { value: "session", label: "Once per session" },
  { value: "days", label: "Again after a number of days" },
  { value: "always", label: "Every page view" },
];

export const POPUP_DEVICES = [
  { value: "desktop", label: "Desktop" },
  { value: "mobile", label: "Mobile" },
];

export const URL_MODES = [
  { value: "all", label: "Every page" },
  { value: "include", label: "Only matching pages" },
  { value: "exclude", label: "All pages except matching" },
];

export function defaultTrigger(type = "exit_intent") {
  if (type === "scroll") return { type, value: 50 };
  if (type === "delay") return { type, value: 8 };
  if (type === "click") return { type, value: "[data-geiger-open]" };
  return { type: "exit_intent", value: null };
}

export function defaultTargeting() {
  return { urls: { mode: "all", patterns: [] }, devices: ["desktop", "mobile"], frequency: { type: "days", days: 7 } };
}

export function defaultDesign(layout = "modal") {
  return {
    layout,
    position: POPUP_POSITIONS[layout]?.[0]?.value || "center",
    headline: "Get 10% off your first order",
    body: "Join the list for launches and the occasional offer. No spam.",
    imageUrl: "",
    showClose: true,
  };
}

export function triggerSummary(trigger = {}) {
  if (trigger.type === "scroll") return `After ${Number(trigger.value) || 50}% scroll`;
  if (trigger.type === "delay") return `After ${Number(trigger.value) || 0}s`;
  if (trigger.type === "click") return `Click on ${trigger.value || "selector"}`;
  return "Exit intent";
}

export function frequencySummary(frequency = {}) {
  if (frequency.type === "once") return "Once per visitor";
  if (frequency.type === "session") return "Once per session";
  if (frequency.type === "always") return "Every page view";
  return `At most every ${Number(frequency.days) || 7} days`;
}

// `*` matches any run of characters; a pattern without a scheme matches against the path + query.
export function urlMatches(pattern, href) {
  const p = String(pattern || "").trim();
  if (!p) return false;
  let target = href;
  try {
    const url = new URL(href);
    target = /^https?:/i.test(p) ? url.href : `${url.pathname}${url.search}`;
  } catch {
    // Matches against the raw string.
  }
  const source = p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${source}$`, "i").test(target);
}

export function targetsUrl(targeting = {}, href) {
  const mode = targeting?.urls?.mode || "all";
  const patterns = targeting?.urls?.patterns || [];
  if (mode === "all" || !patterns.length) return true;
  const hit = patterns.some((p) => urlMatches(p, href));
  return mode === "include" ? hit : !hit;
}
