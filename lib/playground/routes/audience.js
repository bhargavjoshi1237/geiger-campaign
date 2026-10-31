// Playground stand-ins for the Audience server routes, answered from the in-memory seed by the real
// Audience engines (resolver, segment evaluation, lead scoring, CSV import) over a memory client, so the
// numbers the screens show are exactly what the live routes would compute. Nothing leaves the browser.

import { createMemoryClient } from "../memory_client.js";
import { getPlaygroundDb, PLAYGROUND_USER } from "../db.js";
import { playgroundRpc } from "../rpc.js";
import { json } from "../intercept_fetch.js";
import { countSegment, resolveAudienceDetailed } from "../../audience/resolve.js";
import { recomputeLeadScores } from "../../audience/scoring.js";
import { importContacts, MAX_IMPORT_ROWS } from "../../audience/import.js";
import { CONSENT_CHANNELS } from "../../audience/contact_model.js";

const CHANNELS = new Set(CONSENT_CHANNELS.map((c) => c.key));
const invalid = (error) => json({ error, code: "invalid_input" }, 400);

let client = null;

function audienceDb() {
  client ??= createMemoryClient({
    getDb: getPlaygroundDb,
    user: PLAYGROUND_USER,
    rpc: playgroundRpc,
    defaults: (_table, row) => ({ metadata: {}, deleted_at: null, ...row }),
  });
  return client.schema("campaign");
}

async function estimate({ params, body }) {
  const channel = body?.channel || "email";
  if (!CHANNELS.has(channel)) return invalid("Unknown channel.");
  const { recipients, excluded, candidates } = await resolveAudienceDetailed(audienceDb(), params.projectId, body?.audience || {}, { channel });
  return { channel, recipients: recipients.length, candidates, excluded };
}

async function evaluateSegment({ params }) {
  const segment = getPlaygroundDb()
    .table("segments")
    .find((s) => s.id === params.segmentId && s.project_id === params.projectId && s.deleted_at == null);
  if (!segment) return json({ error: "That segment no longer exists.", code: "not_found" }, 404);
  const { count, total, sampleIds } = await countSegment(audienceDb(), params.projectId, segment);
  const computedAt = new Date().toISOString();
  Object.assign(segment, { contact_count: count, computed_at: computedAt, updated_at: computedAt });
  return { count, total, sampleIds, computedAt };
}

async function recompute({ params }) {
  const result = await recomputeLeadScores(audienceDb(), params.projectId);
  if (!result.rules) return invalid("Turn on at least one scoring rule first.");
  return result;
}

async function importChunk({ params, body }) {
  const rows = Array.isArray(body?.rows) ? body.rows : null;
  if (!rows) return invalid("Send the parsed rows as `rows`.");
  if (rows.length > MAX_IMPORT_ROWS) return invalid(`Send at most ${MAX_IMPORT_ROWS} rows per request.`);
  const options = body.options && typeof body.options === "object" ? body.options : {};
  if (options.consent?.channels?.length && options.consent.attested !== true) {
    return invalid("Confirm these contacts gave consent before recording it.");
  }
  return importContacts(audienceDb(), params.projectId, rows, {
    ...options,
    userId: PLAYGROUND_USER.id,
    ip: null,
    userAgent: typeof navigator === "undefined" ? null : navigator.userAgent,
  });
}

export const audienceRoutes = [
  ["POST", "/api/projects/:projectId/audience/estimate", estimate],
  ["POST", "/api/projects/:projectId/audience/segments/:segmentId/evaluate", evaluateSegment],
  ["POST", "/api/projects/:projectId/audience/scoring/recompute", recompute],
  ["POST", "/api/projects/:projectId/audience/import", importChunk],
];
