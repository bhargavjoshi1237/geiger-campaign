import { requireMember } from "@/lib/server/auth";
import { badRequest, handle, readJson } from "@/lib/server/http";
import { resolveAudienceDetailed } from "@/lib/audience/resolve";
import { CONSENT_CHANNELS } from "@/lib/audience/contact_model";

// Who an audience would reach on a channel right now, and why everyone else is dropped:
// body { audience: { listIds, segmentIds, excludeListIds, excludeSegmentIds, all }, channel }.
export const runtime = "nodejs";
export const maxDuration = 60;

const CHANNELS = new Set(CONSENT_CHANNELS.map((c) => c.key));

export async function POST(request, { params }) {
  const { projectId } = await params;
  return handle("audience.estimate", async () => {
    const { db } = await requireMember(projectId);
    const body = await readJson(request);
    const channel = body?.channel || "email";
    if (!CHANNELS.has(channel)) throw badRequest("Unknown channel.");
    const { recipients, excluded, candidates } = await resolveAudienceDetailed(db, projectId, body?.audience || {}, { channel });
    return { channel, recipients: recipients.length, candidates, excluded };
  });
}
