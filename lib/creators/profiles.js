import { badRequest, notFound } from "@/lib/server/http";
import { CreatorLookupError, lookupInstagramCreator } from "./instagram";

// Creator profile refresh (server-only): re-reads a creator's public Instagram metrics through business
// discovery and stores them on the row. Used by the refresh route and, for stale profiles, the worker.

const STALE_MS = 7 * 86_400_000;

export async function refreshCreatorMetrics(db, { projectId, creatorId, now = new Date() }) {
  const { data: creator } = await db
    .from("creators")
    .select("*")
    .eq("project_id", projectId)
    .eq("id", creatorId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!creator) throw notFound("Creator not found.");
  const handle = creator.handles?.instagram;
  if (!handle) throw badRequest("Add this creator's Instagram handle to pull public metrics.");

  const profile = await lookupInstagramCreator(db, projectId, handle, now);
  const patch = { audience: { ...(creator.audience || {}), ...profile.audience } };
  if (profile.avatarUrl) patch.avatar_url = profile.avatarUrl;
  if (!creator.name && profile.name) patch.name = profile.name;
  const { data, error } = await db.from("creators").update(patch).eq("id", creator.id).select("*").single();
  if (error) throw new CreatorLookupError(500, "Metrics were fetched but couldn't be saved.", "save_failed");
  return data;
}

// Worker: refresh business-discovery profiles older than a week, a few per tick to stay inside rate limits.
export async function refreshStaleCreators(db, { now = new Date(), deadline = Infinity, limit = 10 } = {}) {
  const { data, error } = await db
    .from("creators")
    .select("id, project_id, audience, handles")
    .eq("audience->>source", "business_discovery")
    .is("deleted_at", null)
    .order("updated_at", { ascending: true })
    .limit(200);
  if (error) {
    console.error("[creators.profiles.stale]", error.message);
    return { error: "load_failed" };
  }
  const stale = (data || [])
    .filter((c) => {
      const last = Math.max(Date.parse(c.audience?.refreshedAt) || 0, Date.parse(c.audience?.lastAttemptAt) || 0);
      return c.handles?.instagram && last < now.getTime() - STALE_MS;
    })
    .slice(0, limit);
  const blocked = new Set();
  const summary = { refreshed: 0, failed: 0 };
  for (const c of stale) {
    if (Date.now() > deadline || blocked.has(c.project_id)) continue;
    try {
      await refreshCreatorMetrics(db, { projectId: c.project_id, creatorId: c.id, now });
      summary.refreshed += 1;
    } catch (e) {
      summary.failed += 1;
      const audience = { ...(c.audience || {}), lastAttemptAt: now.toISOString(), lastRefreshError: String(e?.message || "failed").slice(0, 200) };
      await db.from("creators").update({ audience }).eq("id", c.id);
      // A disconnected account fails every lookup in that project; skip the rest of them.
      if (e?.code === "not_connected" || e?.code === "graph_error") blocked.add(c.project_id);
    }
  }
  return summary;
}
