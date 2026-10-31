import { handle } from "@/lib/server/http";
import { requireMember } from "@/lib/server/auth";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { isSigningConfigured } from "@/lib/server/tokens";
import { graphVersion } from "@/lib/social/meta_graph";
import { ADS_SCOPES, isMetaAppConfigured } from "@/lib/ads/meta_ads";

export const runtime = "nodejs";

// Deployment-level ads configuration the screens show honestly: can Meta login run, can the server write.
export async function GET(_request, { params }) {
  return handle("ads.status", async () => {
    const { projectId } = await params;
    await requireMember(projectId);
    const signing = isSigningConfigured();
    return {
      oauth: isMetaAppConfigured() && signing,
      admin: isAdminConfigured(),
      signing,
      graphVersion: graphVersion(),
      scopes: ADS_SCOPES,
    };
  });
}
