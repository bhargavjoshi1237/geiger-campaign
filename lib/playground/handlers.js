// Everything the playground swaps into the data layer while it is mounted (see
// ./mode.js and ./use_playground_mode.js). Campaign builds every Supabase client
// through lib/supabase/client.js, so createClient is the only stand-in, and the
// app has no /api/* routes to fake.

import { createMemoryClient } from "./memory_client.js";
import { getPlaygroundDb, PLAYGROUND_USER } from "./db.js";
import { playgroundRpc } from "./rpc.js";

// Columns the database would default on insert.
const INSERT_DEFAULTS = {
  roles: { metadata: {}, deleted_at: null },
  role_grants: { scope: {}, status: "active", metadata: {}, deleted_at: null },
};

// One client for the whole session, so every createClient() call shares state.
let client = null;

function createPlaygroundClient() {
  client ??= createMemoryClient({
    getDb: getPlaygroundDb,
    user: PLAYGROUND_USER,
    rpc: playgroundRpc,
    defaults: (table, row) => ({ ...INSERT_DEFAULTS[table], ...row }),
  });
  return client;
}

export const playgroundHandlers = {
  createClient: createPlaygroundClient,
};

// Campaign has no /api/* calls to fake.
export const playgroundRoutes = null;
