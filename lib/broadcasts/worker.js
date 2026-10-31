// broadcasts worker job, run by app/api/internal/worker on every scheduler tick (server-only).
// Stub until the Broadcasts work lands: process due work in bounded batches and return a summary.
export const name = "broadcasts";

export async function run() {
  return { processed: 0 };
}
