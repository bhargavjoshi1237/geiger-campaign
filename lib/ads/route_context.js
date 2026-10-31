import { NextResponse } from "next/server";
import { assertUuid, requirePermission } from "@/lib/server/auth";
import { notConfigured, notFound } from "@/lib/server/http";
import { publicUrl } from "@/lib/server/urls";
import { adminClient } from "@/lib/supabase/admin";

// Route plumbing for the ads endpoints: campaign.ads.manage on the user session, then the service-role db
// (tokens live in server-only secret tables). Every lookup is scoped to the route's project.

export const ADS_MANAGE = "campaign.ads.manage";

export async function adsContext(params, permission = ADS_MANAGE) {
  const resolved = await params;
  const { user } = await requirePermission(resolved.projectId, permission);
  const db = adminClient();
  if (!db) throw notConfigured("SUPABASE_SERVICE_ROLE_KEY isn't configured on the server.");
  return { ...resolved, user, db };
}

// One row of an ads table that belongs to the project, or a 404.
export async function loadOwned(db, table, projectId, id, label = "Record") {
  assertUuid(id, `${label.toLowerCase()} id`);
  const { data } = await db.from(table).select("*").eq("project_id", projectId).eq("id", id).is("deleted_at", null).maybeSingle();
  if (!data) throw notFound(`${label} not found.`);
  return data;
}

// Back to Ad Campaigns after the OAuth round-trip, with the outcome in the query string.
export function backToAds(projectId, params) {
  const path = projectId ? `/project/${projectId}/adcampaigns` : "/home";
  return NextResponse.redirect(publicUrl(path, params));
}

export const metaAdsRedirectUri = () => publicUrl("/api/ads/oauth/meta/callback");
