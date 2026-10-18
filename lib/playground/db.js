// The playground's in-memory database: every seeded table, built lazily the
// first time the playground queries it and kept for the rest of the page
// session, so edits survive tab switches but a reload starts fresh.
//
// Campaign's screens keep their own screen-local data; only the workspace
// shell, the topbar and Team & Roles read through the data layer. Bare table
// names serve both client.schema("public") and client.schema("campaign").

import { createMemoryDb } from "./memory_client.js";
import { PLAYGROUND_PERSON } from "./cast.js";
import { workspaceSeed } from "./seed/workspace.js";
import { teamSeed } from "./seed/team.js";
import { notificationsSeed } from "./seed/notifications.js";

// Shaped like a Supabase auth user so the app's session parsing reads it
// unchanged. `avatar_version: 0` makes lib/supabase/user.js use initials
// instead of a storage URL on the real project.
export const PLAYGROUND_USER = {
  id: PLAYGROUND_PERSON.id,
  email: PLAYGROUND_PERSON.email,
  user_metadata: {
    full_name: PLAYGROUND_PERSON.name,
    avatar_url: PLAYGROUND_PERSON.avatar_url,
    avatar_version: 0,
  },
  app_metadata: {},
  aud: "authenticated",
  role: "authenticated",
};

export const getPlaygroundDb = createMemoryDb(() => ({
  ...workspaceSeed(),
  ...teamSeed(),
  ...notificationsSeed(),
}));
