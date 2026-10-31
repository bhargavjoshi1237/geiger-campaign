import { badRequest, handle, readJson } from "@/lib/server/http";
import { authenticateApiKey } from "@/lib/server/api_keys";
import { eventsFromBody, ingestBatch, MAX_API_BATCH } from "@/lib/data/tracking";

// Developer API: record server-side events (events:write). Body is one event or { events: [...] } (≤ 100).
// Each event: { name, contact_id | email | phone | anonymous_id, properties, revenue, currency, url, occurred_at }
// or { type: "identify", email, traits }.
export const runtime = "nodejs";

export async function POST(request) {
  return handle("v1.events.create", async () => {
    const { db, projectId } = await authenticateApiKey(request, { scope: "events:write" });
    const events = eventsFromBody(await readJson(request));
    if (!events.length) throw badRequest("Send at least one event.");
    if (events.length > MAX_API_BATCH) throw badRequest(`Send at most ${MAX_API_BATCH} events per request.`);
    const result = await ingestBatch(db, { projectId, source: "api", events, maxAgeDays: 365, newContactStatus: "pending" });
    return { accepted: result.accepted, identified: result.identified, rejected: result.rejected };
  });
}
