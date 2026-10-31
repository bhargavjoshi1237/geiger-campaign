import { adminClient } from "@/lib/supabase/admin";
import { authorizeWorker } from "@/lib/server/auth";
import { handle, notConfigured } from "@/lib/server/http";
import { JOBS } from "@/lib/server/jobs";

// The scheduler tick: Vercel Cron (GET, CRON_SECRET) or an external scheduler (POST, CAMPAIGN_WORKER_SECRET)
// runs every area's job in order within one bounded invocation. A failing job is logged and skipped so
// it never starves the rest.
export const runtime = "nodejs";
export const maxDuration = 300;

const BUDGET_MS = 270_000;

async function tick(request) {
  return handle("worker", async () => {
    authorizeWorker(request);
    const db = adminClient();
    if (!db) throw notConfigured("SUPABASE_SERVICE_ROLE_KEY isn't configured.");

    const startedAt = Date.now();
    const deadline = startedAt + BUDGET_MS;
    const results = {};
    for (const job of JOBS) {
      if (Date.now() > deadline) {
        results[job.name] = { skipped: "time budget" };
        continue;
      }
      try {
        results[job.name] = await job.run({ db, now: new Date(), deadline });
      } catch (error) {
        console.error(`[worker.${job.name}]`, error);
        results[job.name] = { error: "failed" };
      }
    }
    return { ok: true, durationMs: Date.now() - startedAt, results };
  });
}

export const GET = tick;
export const POST = tick;
