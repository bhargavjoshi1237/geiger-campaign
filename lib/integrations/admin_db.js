import { adminClient } from "@/lib/supabase/admin";
import { notConfigured } from "@/lib/server/http";

// The service-role db for routes that touch server-only secret tables, or a 503 saying what's missing.
export function requireAdminDb() {
  const db = adminClient();
  if (!db) throw notConfigured("Server credentials aren't configured (SUPABASE_SERVICE_ROLE_KEY is missing).");
  return db;
}

// One extra permission check beyond the route's own requirePermission (same predicate RLS uses).
export async function hasPermission(ctx, projectId, permission) {
  const { data, error } = await ctx.db.rpc("rbac_allows", { p_permission: permission, p_project: projectId });
  return !error && Boolean(data);
}
