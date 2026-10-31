import { timingSafeEqual } from "node:crypto";
import { createRouteClient } from "@/lib/supabase/server";
import { ApiError, badRequest, forbidden, notConfigured, unauthorized } from "./http";

// Authorization for route handlers. RLS stays the data boundary; these checks fail fast with a clear
// status before any work, and hand back the user-scoped client so later queries run under RLS.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(value, label = "id") {
  if (typeof value !== "string" || !UUID.test(value)) throw badRequest(`A valid ${label} is required.`);
  return value;
}

// The signed-in caller plus user-scoped clients (`db` = campaign schema, `supabase` = full client); 401 without a session.
export async function requireUser() {
  const supabase = await createRouteClient();
  if (!supabase) throw notConfigured("Supabase isn't configured.");
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) throw unauthorized();
  return { user: data.user, supabase, db: supabase.schema("campaign") };
}

// The caller must hold `permission` in `projectId` (campaign.rbac_allows, the same predicate RLS uses).
export async function requirePermission(projectId, permission) {
  assertUuid(projectId, "project id");
  const ctx = await requireUser();
  const { data, error } = await ctx.db.rpc("rbac_allows", { p_permission: permission, p_project: projectId });
  if (error) throw new ApiError(500, "Couldn't check your access.", "rbac_failed");
  if (!data) throw forbidden();
  return ctx;
}

// Any active grant in the project.
export async function requireMember(projectId) {
  assertUuid(projectId, "project id");
  const ctx = await requireUser();
  const { data, error } = await ctx.db.rpc("rbac_is_member", { p_project: projectId });
  if (error) throw new ApiError(500, "Couldn't check your access.", "rbac_failed");
  if (!data) throw forbidden("You aren't a member of this project.");
  return ctx;
}

// Scheduler/worker routes: `Authorization: Bearer <CAMPAIGN_WORKER_SECRET>` (or Vercel Cron's CRON_SECRET).
export function authorizeWorker(request) {
  const header = request.headers.get("authorization") || "";
  const secrets = [process.env.CAMPAIGN_WORKER_SECRET, process.env.CRON_SECRET].filter(Boolean);
  const actual = Buffer.from(header);
  const ok = secrets.some((secret) => {
    const expected = Buffer.from(`Bearer ${secret}`);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
  if (!ok) throw unauthorized("Worker authentication required.");
}
