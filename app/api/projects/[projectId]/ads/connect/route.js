import { NextResponse } from "next/server";
import { handle } from "@/lib/server/http";
import { requirePermission } from "@/lib/server/auth";
import { startAdsOAuth } from "@/lib/ads/connect";
import { ADS_MANAGE, metaAdsRedirectUri } from "@/lib/ads/route_context";

export const runtime = "nodejs";

// Browser navigation into Facebook Login with the ads scopes; the callback lands back on Ad Campaigns.
export async function GET(_request, { params }) {
  return handle("ads.connect", async () => {
    const { projectId } = await params;
    const { user } = await requirePermission(projectId, ADS_MANAGE);
    return NextResponse.redirect(startAdsOAuth({ projectId, userId: user.id, redirectUri: metaAdsRedirectUri() }));
  });
}
