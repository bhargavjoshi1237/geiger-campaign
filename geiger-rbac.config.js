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

// Operation keys of catalog version 1; everything else in operationPermissions arrived in version 2.
const LEGACY_OPERATION_KEYS = [
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
  "campaign.billing.manage",
  "campaign.settings.manage",
];

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
  { key: "campaign.content.edit", label: "Manage templates, content blocks and assets", group: "Content" },
  { key: "campaign.channel.manage", label: "Connect and configure channels and senders", group: "Channels" },
  { key: "campaign.deliverability.manage", label: "Manage sending domains, IPs and warmup", group: "Deliverability" },
  { key: "campaign.transactional.manage", label: "Manage transactional templates and routing", group: "Transactional" },
  { key: "campaign.inbox.reply", label: "Reply to and assign conversations", group: "Inbox" },
  { key: "campaign.acquisition.edit", label: "Build forms, landing pages, popups and surveys", group: "Acquisition" },
  { key: "campaign.commerce.edit", label: "Manage stores, products, orders and coupons", group: "Commerce" },
  { key: "campaign.crm.edit", label: "Manage deals, companies and tasks", group: "CRM" },
  { key: "campaign.report.edit", label: "Build dashboards and custom reports", group: "Reporting" },
  { key: "campaign.data.manage", label: "Manage custom objects, catalogs, tracking and syncs", group: "Data" },
  { key: "campaign.approval.decide", label: "Approve or reject campaigns", group: "Campaigns" },
  { key: "campaign.ai.use", label: "Generate with the AI assistant", group: "AI Assistant" },
  { key: "campaign.chat.edit", label: "Build chat automations and DM flows", group: "Chat Automation" },
  { key: "campaign.broadcast.edit", label: "Create broadcasts and message templates", group: "Broadcasts" },
  { key: "campaign.broadcast.send", label: "Send broadcasts", group: "Broadcasts" },
  { key: "campaign.social.edit", label: "Draft social posts and moderation rules", group: "Social" },
  { key: "campaign.social.publish", label: "Publish and schedule social posts", group: "Social" },
  { key: "campaign.community.edit", label: "Manage channels and communities", group: "Communities" },
  { key: "campaign.ads.manage", label: "Manage ads, lead forms and audience sync", group: "Ads" },
  { key: "campaign.creator.manage", label: "Manage creators, collaborations and payouts", group: "Creators" },
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

// Day-to-day operating keys every role from Member up holds.
const memberOperations = [
  "campaign.campaign.edit",
  "campaign.contact.edit",
  "campaign.automation.edit",
  "campaign.content.edit",
  "campaign.inbox.reply",
  "campaign.acquisition.edit",
  "campaign.crm.edit",
  "campaign.ai.use",
  "campaign.chat.edit",
  "campaign.broadcast.edit",
  "campaign.social.edit",
];

// Run-the-programme keys: sending, publishing and the commercial surfaces.
const managerOperations = [
  ...memberOperations,
  "campaign.campaign.send",
  "campaign.campaign.delete",
  "campaign.contact.import",
  "campaign.contact.export",
  "campaign.automation.publish",
  "campaign.commerce.edit",
  "campaign.report.edit",
  "campaign.approval.decide",
  "campaign.broadcast.send",
  "campaign.social.publish",
  "campaign.community.edit",
  "campaign.ads.manage",
  "campaign.creator.manage",
  "campaign.team.invite",
  "campaign.team.assign",
];

// Workspace administration: infrastructure, integrations, data and access.
const adminOperations = [
  ...managerOperations,
  "campaign.contact.delete",
  "campaign.integration.manage",
  "campaign.channel.manage",
  "campaign.deliverability.manage",
  "campaign.transactional.manage",
  "campaign.data.manage",
  "campaign.role.manage",
  "campaign.settings.manage",
];

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
    permissions: [...viewKeys, ...adminOperations],
    sort: 1,
  }),
  defineRole({
    key: "manager",
    name: "Manager",
    description: "Run campaigns and add teammates; can't edit roles or billing.",
    color: "emerald",
    permissions: [...viewKeys, ...managerOperations],
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
      "campaign.crm.view",
      "campaign.acquisition.view",
      "campaign.chat_automation.view",
      "campaign.broadcasts.view",
      "campaign.social.view",
      ...memberOperations,
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

// Catalog versions: keys a release added to the system roles, merged once into roles seeded before it.
export const CATALOG_VERSION = 2;

export const CATALOG_ADDITIONS = {
  2: [
    ...operationPermissions
      .map((p) => p.key)
      .filter((key) => !LEGACY_OPERATION_KEYS.includes(key)),
    ...["CRM", "Acquisition", "Chat Automation", "Broadcasts", "Social"].map(navPermissionKey),
  ],
};

export default defineRbacConfig({
  product: "campaign",
  permissions,
  systemRoles,
});
