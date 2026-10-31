import { requirePermission } from "@/lib/server/auth";
import { notConfigured } from "@/lib/server/http";
import { adminClient } from "@/lib/supabase/admin";

// Workspace route preamble for Channels & Transactional: the caller holds `permission` in the project
// (RLS predicate, checked up front), then server writes run on the service role.
export async function authorizeChannels(projectId, permission = "campaign.channel.manage") {
  const ctx = await requirePermission(projectId, permission);
  const admin = adminClient();
  if (!admin) throw notConfigured("SUPABASE_SERVICE_ROLE_KEY isn't configured on this deployment.");
  return { ...ctx, admin };
}

export function requireAdminDb() {
  const admin = adminClient();
  if (!admin) throw notConfigured("SUPABASE_SERVICE_ROLE_KEY isn't configured on this deployment.");
  return admin;
}
