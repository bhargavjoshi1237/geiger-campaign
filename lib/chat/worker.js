import { drainOutbox } from "./outbox";
import { processDueSessions } from "./flows";
import { processDueEnrollments } from "./sequences";
import { buildContext } from "./store";

// chat worker job, run by app/api/internal/worker on every scheduler tick (server-only): sends replies held
// back by quiet hours, resumes flow sessions whose delay ended or reply timed out, and sends due sequence
// steps — each in a bounded batch, idempotent per row.
export const name = "chat";

export async function run({ db, now = new Date(), deadline = Infinity } = {}) {
  if (!db) return { processed: 0, skipped: "no database" };
  const outbox = await drainOutbox(db, { now, deadline });
  const sessions = Date.now() < deadline ? await processDueSessions(db, { now, deadline, buildContext }) : { processed: 0, skipped: "time budget" };
  const sequences = Date.now() < deadline ? await processDueEnrollments(db, { now, deadline }) : { processed: 0, skipped: "time budget" };
  return {
    processed: (outbox.processed || 0) + (sessions.processed || 0) + (sequences.processed || 0),
    outbox,
    sessions,
    sequences,
  };
}
