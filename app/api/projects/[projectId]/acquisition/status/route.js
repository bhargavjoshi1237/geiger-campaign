import { handle } from "@/lib/server/http";
import { requireMember } from "@/lib/server/auth";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { isSigningConfigured } from "@/lib/server/tokens";
import { isEmailConfigured } from "@/lib/email/client";
import { publicBaseUrl } from "@/lib/server/urls";

// GET /api/projects/:projectId/acquisition/status — what the acquisition screens need to tell the truth:
// the public base URL for embed snippets and links, and whether ingest, signing and email are configured.
export const runtime = "nodejs";

export async function GET(_request, { params }) {
  return handle("acquisition.status", async () => {
    const { projectId } = await params;
    await requireMember(projectId);
    return {
      publicBaseUrl: publicBaseUrl(),
      publicUrlConfigured: Boolean(process.env.CAMPAIGN_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL),
      ingestConfigured: isAdminConfigured(),
      signingConfigured: isSigningConfigured(),
      emailConfigured: isEmailConfigured(),
    };
  });
}
