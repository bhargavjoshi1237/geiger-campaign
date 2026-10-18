// Team & Roles: the catalog's system roles plus two custom ones (public.roles)
// and who holds which in the project (campaign.role_grants). Two studio people
// hold no grant, so the "Add member" picker has candidates.

import rbacConfig, { navPermissionKey } from "@/geiger-rbac.config";
import { PROJECT_ID, daysAgo, sid } from "./helpers.js";
import { PLAYGROUND_PERSON, personId } from "../cast.js";

const CUSTOM_ROLES = [
  {
    name: "Lifecycle Specialist",
    description: "Builds journeys and nurture flows; can publish automations but not send one-off campaigns.",
    color: "emerald",
    permissions: [
      ...["Overview", "Audience", "Campaigns", "Automations", "Channels", "Reporting", "AI Assistant"].map(navPermissionKey),
      "campaign.campaign.edit",
      "campaign.contact.edit",
      "campaign.automation.edit",
      "campaign.automation.publish",
    ],
  },
  {
    name: "Client Reviewer",
    description: "Client-side stakeholders who review campaigns and results before launch.",
    color: "blue",
    permissions: ["Overview", "Campaigns", "Reporting"].map(navPermissionKey),
  },
];

// person n -> role key (system) or custom role name.
const ASSIGNMENTS = [
  [1, "owner", 412],
  [2, "admin", 398],
  [3, "manager", 371],
  [4, "manager", 344],
  [10, "manager", 302],
  [5, "member", 276],
  [6, "member", 233],
  [7, "member", 187],
  [8, "Lifecycle Specialist", 96],
  [12, "viewer", 41],
];

export function teamSeed() {
  const system = rbacConfig.systemRoles.map((role, i) => ({
    id: sid("role", i + 1),
    project_id: PROJECT_ID,
    key: role.key,
    name: role.name,
    description: role.description,
    color: role.color,
    permissions: [...role.permissions],
    is_system: true,
    sort: role.sort,
    metadata: { key: role.key },
    created_by: PLAYGROUND_PERSON.id,
    created_at: daysAgo(412),
    updated_at: daysAgo(412),
    deleted_at: null,
  }));

  const custom = CUSTOM_ROLES.map((role, i) => ({
    id: sid("role", system.length + i + 1),
    project_id: PROJECT_ID,
    key: null,
    name: role.name,
    description: role.description,
    color: role.color,
    permissions: role.permissions,
    is_system: false,
    sort: 100 + i,
    metadata: {},
    created_by: PLAYGROUND_PERSON.id,
    created_at: daysAgo(120 - i * 30),
    updated_at: daysAgo(60 - i * 20),
    deleted_at: null,
  }));

  const roles = [...system, ...custom];
  const roleFor = (ref) => roles.find((r) => r.key === ref || r.name === ref);

  const role_grants = ASSIGNMENTS.map(([n, ref, since], i) => ({
    id: sid("grant", i + 1),
    project_id: PROJECT_ID,
    user_id: personId(n),
    role_id: roleFor(ref).id,
    scope: {},
    status: "active",
    metadata: {},
    granted_by: n === 1 ? null : PLAYGROUND_PERSON.id,
    created_at: daysAgo(since),
    updated_at: daysAgo(Math.max(1, since - 7)),
    deleted_at: null,
  }));

  return { roles, role_grants };
}
