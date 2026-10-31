import { assertUuid, requireMember, requirePermission } from "@/lib/server/auth";
import { notConfigured } from "@/lib/server/http";
import { adminClient } from "@/lib/supabase/admin";

// Shared preamble for the campaign send routes (server-only): resolve params, authorize the caller,
// and hand back the service-role client the pipeline writes through (deliveries are server-written).
export async function campaignRoute(params, permission = null, { needsAdmin = true } = {}) {
  const { projectId, campaignId } = await params;
  const ctx = permission ? await requirePermission(projectId, permission) : await requireMember(projectId);
  if (campaignId !== undefined) assertUuid(campaignId, "campaign id");
  const admin = adminClient();
  if (needsAdmin && !admin) throw notConfigured("The sending pipeline needs SUPABASE_SERVICE_ROLE_KEY on the server.");
  return { ...ctx, projectId, campaignId, admin };
}

// How long a route keeps sending after it responds (Next's after(), within maxDuration).
export const AFTER_RESPONSE_MS = 240_000;
