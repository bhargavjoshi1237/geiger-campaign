// Lookups and formatters for the Team & Roles screen (config only — rows come from lib/supabase/rbac.js).

// public.roles.color → @geiger/ui Badge variant.
export const ROLE_COLOR_VARIANT = {
  violet: "purple",
  blue: "info",
  emerald: "success",
  amber: "warning",
  red: "danger",
  slate: "neutral",
};

export const ROLE_COLOR_OPTIONS = [
  { value: "slate", label: "Slate" },
  { value: "blue", label: "Blue" },
  { value: "emerald", label: "Emerald" },
  { value: "amber", label: "Amber" },
  { value: "violet", label: "Violet" },
  { value: "red", label: "Red" },
];

export const TEAM_TABS = [
  { value: "members", label: "Members" },
  { value: "roles", label: "Roles & Permissions" },
];

export function roleVariant(color) {
  return ROLE_COLOR_VARIANT[color] || "neutral";
}

export function initials(name) {
  return (
    String(name || "")
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

export function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
