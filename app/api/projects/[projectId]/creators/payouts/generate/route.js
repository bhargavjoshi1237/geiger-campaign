import { handle, readJson } from "@/lib/server/http";
import { requirePermission } from "@/lib/server/auth";
import { generatePayouts } from "@/lib/creators/payouts";
import { WRITE_KEY } from "@/lib/creators/server";

// POST { period: "YYYY-MM" } -> pending payouts from approved conversions + completed collaboration fees.
export const runtime = "nodejs";

export async function POST(request, { params }) {
  const { projectId } = await params;
  return handle("creators.payouts.generate", async () => {
    const { db, user } = await requirePermission(projectId, WRITE_KEY);
    const body = await readJson(request);
    return generatePayouts(db, { projectId, period: String(body?.period || ""), userId: user.id });
  });
}
