import { defineRbacConfig, defineRole } from "@geiger/rbac";

// The @geiger/rbac catalog for Geiger Campaign — the trusted half of authorization (keys, scopes, conditions).
// Keys are "<product>.<resource>.<action>": nav keys gate a sidebar section, operation keys gate a control.
// Section titles must match components/internal/sidebar/sidebar_data.js exactly; renaming one needs a key rename here too.

export function navSlug(title) {
  return String(title || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function navPermissionKey(title) {
  return `campaign.${navSlug(title)}.view`;
}

export const NAV_SECTIONS = [
  "Overview",
  "Audience",
  "Campaigns",
  "Automations",
  "Channels",
  "Chat Automation",
  "Broadcasts",
  "Social",
  "Communities",
  "Ads",
  "Creators",
  "Transactional",
  "Deliverability",
  "CRM",
  "Inbox",
  "Acquisition",
  "Commerce",
  "Content",
  "Reporting",
  "AI Assistant",
  "Data",
  "Integrations",
  "Settings",
];

const navPermissions = NAV_SECTIONS.map((title) => ({
  key: navPermissionKey(title),
  label: title,
  group: "Workspace views",
}));

const operationPermissions = [
  { key: "campaign.campaign.edit", label: "Create and edit campaigns", group: "Campaigns" },
  { key: "campaign.campaign.send", label: "Send or schedule a campaign", group: "Campaigns" },
  { key: "campaign.campaign.delete", label: "Delete a campaign", group: "Campaigns" },
  { key: "campaign.contact.edit", label: "Create and edit contacts", group: "Audience" },
  { key: "campaign.contact.import", label: "Import contacts", group: "Audience" },
  { key: "campaign.contact.export", label: "Export contacts", group: "Audience" },
  { key: "campaign.contact.delete", label: "Delete contacts", group: "Audience" },
  { key: "campaign.automation.edit", label: "Create and edit automations", group: "Automations" },
  { key: "campaign.automation.publish", label: "Activate or pause automations", group: "Automations" },
  { key: "campaign.integration.manage", label: "Manage apps, webhooks and API keys", group: "Integrations" },
  { key: "campaign.team.invite", label: "Add members", group: "Team Control" },
  { key: "campaign.team.assign", label: "Assign roles", group: "Team Control" },
  { key: "campaign.role.manage", label: "Create and edit roles", group: "Team Control" },
  { key: "campaign.billing.manage", label: "Manage billing", group: "Administration" },
  { key: "campaign.settings.manage", label: "Manage settings", group: "Administration" },
];

const permissions = [...navPermissions, ...operationPermissions];

const viewKeys = permissions
  .filter((p) => p.key.endsWith(".view"))
  .map((p) => p.key);

const systemRoles = [
  defineRole({
    key: "owner",
    name: "Owner",
    description: "Full access to everything, including billing.",
    color: "violet",
    permissions: ["*"],
    sort: 0,
  }),
  defineRole({
    key: "admin",
    name: "Admin",
    description: "Manage the workspace, team and roles — no billing control.",
    color: "blue",
    permissions: [
      ...viewKeys,
      "campaign.campaign.edit",
      "campaign.campaign.send",
      "campaign.campaign.delete",
      "campaign.contact.edit",
      "campaign.contact.import",
      "campaign.contact.export",
      "campaign.contact.delete",
      "campaign.automation.edit",
      "campaign.automation.publish",
      "campaign.integration.manage",
      "campaign.team.invite",
      "campaign.team.assign",
      "campaign.role.manage",
      "campaign.settings.manage",
    ],
    sort: 1,
  }),
  defineRole({
    key: "manager",
    name: "Manager",
    description: "Run campaigns and add teammates; can't edit roles or billing.",
    color: "emerald",
    permissions: [
      ...viewKeys,
      "campaign.campaign.edit",
      "campaign.campaign.send",
      "campaign.campaign.delete",
      "campaign.contact.edit",
      "campaign.contact.import",
      "campaign.contact.export",
      "campaign.automation.edit",
      "campaign.automation.publish",
      "campaign.team.invite",
      "campaign.team.assign",
    ],
    sort: 2,
  }),
  defineRole({
    key: "member",
    name: "Member",
    description: "Day-to-day operational access to the workspace.",
    color: "amber",
    permissions: [
      "campaign.overview.view",
      "campaign.audience.view",
      "campaign.campaigns.view",
      "campaign.automations.view",
      "campaign.channels.view",
      "campaign.inbox.view",
      "campaign.content.view",
      "campaign.reporting.view",
      "campaign.ai_assistant.view",
      "campaign.campaign.edit",
      "campaign.contact.edit",
      "campaign.automation.edit",
    ],
    sort: 3,
  }),
  defineRole({
    key: "viewer",
    name: "Viewer",
    description: "Read-only access to the overview and reports.",
    color: "slate",
    permissions: ["campaign.overview.view", "campaign.reporting.view"],
    sort: 4,
  }),
];

export default defineRbacConfig({
  product: "campaign",
  permissions,
  systemRoles,
});
