import rbacConfig, { navPermissionKey, navSlug } from "@/geiger-rbac.config";
import { projectNav, settingsNav } from "@/components/internal/sidebar/projects/sidebar_data";

// The permission catalog as the screens consume it; decisions come from context/rbac-context.js.

export { navPermissionKey, navSlug };

export const PRODUCT = rbacConfig.product;

export const WORKSPACE_PERMISSIONS = rbacConfig.permissions.map((p) => ({
  key: p.key,
  label: p.label,
  group: p.group,
  scopeBy: p.scopeBy,
  conditionText: p.conditionText,
}));

export const ALL_PERMISSION_KEYS = WORKSPACE_PERMISSIONS.map((p) => p.key);

export const SYSTEM_ROLE_SEED = rbacConfig.systemRoles;

// Keys this product owns inside a shared public.roles row (other products' keys must be preserved on write).
export function isProductKey(key) {
  return typeof key === "string" && key.startsWith(`${PRODUCT}.`);
}

export function normalizeRoleId(value) {
  return navSlug(value);
}

export function tabPermissionKey(title) {
  return navPermissionKey(title);
}

export function getRoleById(roles, roleId) {
  return roles?.find((role) => role.id === roleId) || null;
}

// Settings sub-tabs that need an operation key on top of the Settings section view.
const SETTINGS_TAB_PERMISSIONS = {
  Billing: "campaign.billing.manage",
};

// Every permission key a workspace tab (section or sub-tab) requires; sub-tabs inherit their section's view key.
export function permissionsForTab(title) {
  if (settingsNav.some((s) => s.title === title)) {
    const extra = SETTINGS_TAB_PERMISSIONS[title];
    return [tabPermissionKey("Settings"), ...(extra ? [extra] : [])];
  }
  const section = projectNav.find(
    (item) => item.title === title || item.subItems?.some((s) => s.title === title),
  );
  return [tabPermissionKey(section?.title || title)];
}
