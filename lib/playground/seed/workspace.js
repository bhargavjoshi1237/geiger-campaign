// The workspace the playground opens: Halcyon Studio's campaign project, its
// organization and the studio's people (public.projects, organizations,
// organization_users, plus profiles standing in for auth.users identity).

import { PLAYGROUND_PROJECT } from "../mode.js";
import { PEOPLE, PLAYGROUND_PERSON, STUDIO } from "../cast.js";
import { daysAgo, sid } from "./helpers.js";

const ORG_ID = PLAYGROUND_PROJECT.organization_id;

// Org role per person, as public.organization_users stores it.
const ORG_ROLE = { owner: "owner", admin: "admin", manager: "manager", member: "member", viewer: "member" };

export function workspaceSeed() {
  return {
    projects: [
      {
        ...PLAYGROUND_PROJECT,
        status: "active",
        created_by: PLAYGROUND_PERSON.id,
        created_at: daysAgo(412),
        updated_at: daysAgo(1),
        deleted_at: null,
      },
    ],
    organizations: [
      {
        id: ORG_ID,
        name: STUDIO.name,
        slug: "halcyon",
        created_by: PLAYGROUND_PERSON.id,
        created_at: daysAgo(420),
        updated_at: daysAgo(12),
      },
    ],
    organization_users: PEOPLE.map((p) => ({
      id: sid("member", p.n),
      organization: ORG_ID,
      user: p.id,
      role: ORG_ROLE[p.role] || "member",
      created_at: daysAgo(420 - p.n * 23),
    })),
    profiles: PEOPLE.map((p) => ({
      id: p.id,
      email: p.email,
      full_name: p.name,
      avatar_url: p.avatar_url,
      title: p.title,
      organization: STUDIO.name,
      created_at: daysAgo(420 - p.n * 23),
    })),
  };
}
