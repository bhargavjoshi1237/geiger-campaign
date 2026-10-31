import { handle, readJson } from "@/lib/server/http";
import { assertUuid, requirePermission } from "@/lib/server/auth";
import { requestUgcRights } from "@/lib/creators/rights";
import { WRITE_KEY, serviceDb } from "@/lib/creators/server";

// POST { termDays, channels, whitelisting, message } -> emails the creator a signed approve/decline
// link and marks the item's rights as requested.
export const runtime = "nodejs";

export async function POST(request, { params }) {
  const { projectId, ugcId } = await params;
  return handle("creators.ugc.requestRights", async () => {
    assertUuid(ugcId, "content id");
    await requirePermission(projectId, WRITE_KEY);
    const body = await readJson(request);
    return requestUgcRights(serviceDb(), {
      projectId,
      ugcId,
      termDays: body?.termDays,
      channels: Array.isArray(body?.channels) ? body.channels.map(String) : null,
      whitelisting: typeof body?.whitelisting === "boolean" ? body.whitelisting : null,
      message: String(body?.message || "").slice(0, 2000),
    });
  });
}
