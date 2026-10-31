import { selectAll } from "@/lib/campaigns/metrics";
import { campaignRoute } from "@/lib/campaigns/route_context";
import { loadSendTimeSettings } from "@/lib/campaigns/sender";
import { analyzeSendTimes, safeTimeZone } from "@/lib/campaigns/send_time";
import { handle } from "@/lib/server/http";
import { getWorkspaceSettings } from "@/lib/settings/server";

// Send-time analysis over the project's email deliveries (read under the caller's RLS): open heatmap by
// weekday x hour in the workspace time zone, per-contact coverage, recommended windows, time to open.
// ?days=30|90|180 (default 90), ?minOpens=1..20 (default: the workspace setting).
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ROWS = 50_000;

export async function GET(request, { params }) {
  return handle("campaigns.send_time", async () => {
    const { db, admin, projectId } = await campaignRoute(params, null, { needsAdmin: false });
    const url = new URL(request.url);
    const days = [30, 90, 180].includes(Number(url.searchParams.get("days"))) ? Number(url.searchParams.get("days")) : 90;
    const [settings, sto] = await Promise.all([getWorkspaceSettings(admin || db, projectId), loadSendTimeSettings(db, projectId)]);
    const minOpens = Math.min(20, Math.max(1, Number(url.searchParams.get("minOpens")) || sto.minOpens));
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const rows = await selectAll(
      () =>
        db
          .from("deliveries")
          .select("contact_id, status, source_type, sent_at, opened_at")
          .eq("project_id", projectId)
          .eq("channel", "email")
          .gte("created_at", since)
          .order("created_at", { ascending: false }),
      { max: MAX_ROWS },
    );
    const timeZone = safeTimeZone(settings.general?.timezone);
    return {
      days,
      minOpens,
      timeZone,
      truncated: rows.length >= MAX_ROWS,
      analysis: analyzeSendTimes(rows, { timeZone, minOpens }),
    };
  });
}
