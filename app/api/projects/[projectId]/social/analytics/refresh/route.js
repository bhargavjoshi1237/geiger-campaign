import { requireMember } from "@/lib/server/auth";
import { handle, notConfigured, readJson } from "@/lib/server/http";
import { adminClient } from "@/lib/supabase/admin";
import { refreshInsights } from "@/lib/social/insights";

// Pulls fresh account and post insights for the project now: { connectionId? } -> { accounts, posts, errors }.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request, { params }) {
  return handle("social.analytics.refresh", async () => {
    const { projectId } = await params;
    await requireMember(projectId);
    const body = await readJson(request).catch(() => ({}));
    const admin = adminClient();
    if (!admin) throw notConfigured("SUPABASE_SERVICE_ROLE_KEY isn't configured.");
    const connectionId = typeof body?.connectionId === "string" ? body.connectionId : null;
    return refreshInsights(admin, { projectId, connectionId, force: true, deadline: Date.now() + 45_000 });
  });
}
