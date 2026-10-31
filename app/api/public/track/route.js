import { ApiError, badRequest, handle } from "@/lib/server/http";
import { authenticateApiKey } from "@/lib/server/api_keys";
import { eventsFromBody, ingestBatch, MAX_TRACK_BATCH } from "@/lib/data/tracking";

// Browser ingest for the JS snippet (public/sdk/v1.js): identify / track / page, up to 50 per request.
// The public key comes from `x-geiger-key` or the body's `key` (sendBeacon can't set headers), and bodies
// are read as text so the snippet can post text/plain and skip the CORS preflight.
export const runtime = "nodejs";

const MAX_BODY_BYTES = 512_000;

export async function POST(request) {
  return handle("public.track", async () => {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) throw new ApiError(413, "Request body is larger than 512 KB.", "too_large");
    let body;
    try {
      body = JSON.parse(text || "{}");
    } catch {
      throw badRequest("Body must be JSON.");
    }
    const events = eventsFromBody(body);
    if (!events.length) throw badRequest("Send at least one event.");
    if (events.length > MAX_TRACK_BATCH) throw badRequest(`Send at most ${MAX_TRACK_BATCH} events per request.`);

    const key = request.headers.get("x-geiger-key") || (typeof body?.key === "string" ? body.key : null);
    const { db, projectId } = await authenticateApiKey(request, { scope: "events:write", key, kinds: ["public"] });
    const result = await ingestBatch(db, {
      projectId,
      source: "web",
      events,
      userAgent: request.headers.get("user-agent"),
      library: typeof body?.library === "string" ? body.library : null,
      maxAgeDays: 7,
      newContactStatus: "pending",
    });
    return { ok: true, accepted: result.accepted, identified: result.identified, rejected: result.rejected };
  });
}
