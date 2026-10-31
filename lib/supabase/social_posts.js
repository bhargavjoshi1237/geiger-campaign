"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.social_posts + campaign.social_post_targets — composed posts and their per-account
// targets (format, variant copy, publish outcome). Status moves through draft -> in_review -> approved ->
// scheduled; a DB trigger enforces approval/publish permissions, and publishing itself runs server-side.
// Pure: console.error on failure and return null / false / [] — never throw, never toast.

const POSTS = "social_posts";
const TARGETS = "social_post_targets";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);

export function normalizeMedia(item) {
  const m = bag(item);
  return {
    assetId: m.assetId ?? m.asset_id ?? null,
    url: m.url ?? "",
    kind: m.kind === "video" ? "video" : "image",
    altText: m.altText ?? m.alt_text ?? "",
    name: m.name ?? "",
  };
}

export function normalizeSocialPost(row) {
  if (!row) return null;
  const meta = bag(row.metadata);
  return {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    title: row.title ?? "",
    body: row.body ?? "",
    media: arr(row.media).map(normalizeMedia),
    status: row.status ?? "draft",
    scheduledAt: row.scheduled_at ?? null,
    publishedAt: row.published_at ?? null,
    firstComment: row.first_comment ?? "",
    hashtagSetId: row.hashtag_set_id ?? null,
    hashtagPlacement: meta.hashtagPlacement === "first_comment" ? "first_comment" : "caption",
    approval: { history: [], ...bag(row.approval) },
    campaignId: row.campaign_id ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

// camelCase patch -> snake_case columns; a column is emitted only when its key is present.
export function socialPostToRow(input) {
  const row = {};
  const text = { title: "title", body: "body", firstComment: "first_comment" };
  const refs = { status: "status", hashtagSetId: "hashtag_set_id", campaignId: "campaign_id", createdBy: "created_by" };
  for (const [key, col] of Object.entries(text)) if (key in input) row[col] = String(input[key] ?? "");
  for (const [key, col] of Object.entries(refs)) if (key in input) row[col] = input[key] ?? null;
  if ("media" in input) row.media = arr(input.media).map(normalizeMedia);
  if ("scheduledAt" in input) row.scheduled_at = input.scheduledAt || null;
  if ("publishedAt" in input) row.published_at = input.publishedAt || null;
  if ("approval" in input) row.approval = bag(input.approval);
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export function normalizePostTarget(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    postId: row.post_id,
    connectionId: row.connection_id ?? null,
    network: row.network ?? "",
    format: row.format ?? "feed",
    variantText: row.variant_text ?? null,
    status: row.status ?? "pending",
    externalId: row.external_id ?? null,
    permalink: row.permalink ?? "",
    error: row.error ?? "",
    attempts: Number(row.attempts ?? 0),
    publishedAt: row.published_at ?? null,
    metrics: bag(row.metrics),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function postTargetToRow(input) {
  const row = {};
  const map = { connectionId: "connection_id", network: "network", format: "format", status: "status", error: "error" };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key] ?? null;
  if ("variantText" in input) row.variant_text = input.variantText == null || input.variantText === "" ? null : String(input.variantText);
  if ("attempts" in input) row.attempts = Number(input.attempts) || 0;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

// Filters: { status (string | string[]), limit }.
export async function listSocialPosts(projectId, { status, limit = 500 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(POSTS)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status) query = Array.isArray(status) ? query.in("status", status) : query.eq("status", status);
    const { data, error } = await query;
    if (error) {
      console.error("[social_posts.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeSocialPost);
  } catch (e) {
    console.error("[social_posts.list]", e);
    return null;
  }
}

export async function getSocialPost(projectId, id) {
  if (!projectId || !id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(POSTS)
      .select("*")
      .eq("project_id", projectId)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      console.error("[social_posts.get]", error.message);
      return null;
    }
    return normalizeSocialPost(data);
  } catch (e) {
    console.error("[social_posts.get]", e);
    return null;
  }
}

export async function createSocialPost(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...socialPostToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(POSTS).insert(payload).select("*").single();
    if (error) {
      console.error("[social_posts.create]", error.message);
      return null;
    }
    return normalizeSocialPost(data);
  } catch (e) {
    console.error("[social_posts.create]", e);
    return null;
  }
}

export async function updateSocialPost(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(POSTS)
      .update(socialPostToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[social_posts.update]", error.message);
      return null;
    }
    return normalizeSocialPost(data);
  } catch (e) {
    console.error("[social_posts.update]", e);
    return null;
  }
}

// Shallow-merges keys into the post's metadata bag (hashtag placement, notes) without touching other keys.
export async function updateSocialPostMeta(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient().rpc("merge_meta", { p_table: POSTS, p_id: id, p_patch: bag(patch) });
    if (error) {
      console.error("[social_posts.updateMeta]", error.message);
      return null;
    }
    return bag(data);
  } catch (e) {
    console.error("[social_posts.updateMeta]", e);
    return null;
  }
}

export async function softDeleteSocialPost(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const now = new Date().toISOString();
    const { error } = await schemaClient().from(POSTS).update({ deleted_at: now }).eq("id", id);
    if (error) {
      console.error("[social_posts.delete]", error.message);
      return false;
    }
    await schemaClient().from(TARGETS).update({ deleted_at: now }).eq("post_id", id).is("deleted_at", null);
    return true;
  } catch (e) {
    console.error("[social_posts.delete]", e);
    return false;
  }
}

// Filters: { postIds, status (string | string[]), limit }.
export async function listPostTargets(projectId, { postIds, status, limit = 2000 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(TARGETS)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (Array.isArray(postIds)) {
      if (!postIds.length) return [];
      query = query.in("post_id", postIds);
    }
    if (status) query = Array.isArray(status) ? query.in("status", status) : query.eq("status", status);
    const { data, error } = await query;
    if (error) {
      console.error("[social_posts.targets]", error.message);
      return null;
    }
    return (data || []).map(normalizePostTarget);
  } catch (e) {
    console.error("[social_posts.targets]", e);
    return null;
  }
}

// Replaces a post's targets with `targets` ([{ connectionId, network, format, variantText, metadata? }]): existing rows are
// updated (and revived if soft-deleted), new ones inserted, missing ones soft-deleted. Published targets are kept.
export async function savePostTargets(projectId, postId, targets) {
  if (!projectId || !postId || !isSupabaseConfigured()) return null;
  try {
    const sb = schemaClient();
    const { data: existing, error: readError } = await sb.from(TARGETS).select("*").eq("post_id", postId);
    if (readError) {
      console.error("[social_posts.saveTargets]", readError.message);
      return null;
    }
    const byConnection = new Map((existing || []).map((r) => [r.connection_id, r]));
    const wanted = new Set();
    for (const t of arr(targets)) {
      if (!t.connectionId) continue;
      wanted.add(t.connectionId);
      const current = byConnection.get(t.connectionId);
      const fields = postTargetToRow({ network: t.network, format: t.format || "feed", variantText: t.variantText ?? null });
      if (t.metadata) fields.metadata = { ...bag(current?.metadata), ...bag(t.metadata) };
      if (current) {
        if (current.status === "published" && !current.deleted_at) continue;
        const revive = current.deleted_at || current.status === "cancelled" ? { status: "pending", error: null, deleted_at: null } : {};
        const { error } = await sb.from(TARGETS).update({ ...fields, ...revive }).eq("id", current.id);
        if (error) {
          console.error("[social_posts.saveTargets]", error.message);
          return null;
        }
      } else {
        const { error } = await sb
          .from(TARGETS)
          .insert({ ...fields, ...(t.id ? { id: t.id } : {}), project_id: projectId, post_id: postId, connection_id: t.connectionId, status: "pending" });
        if (error) {
          console.error("[social_posts.saveTargets]", error.message);
          return null;
        }
      }
    }
    const removed = (existing || []).filter((r) => !r.deleted_at && !wanted.has(r.connection_id) && r.status !== "published");
    if (removed.length) {
      const { error } = await sb
        .from(TARGETS)
        .update({ deleted_at: new Date().toISOString(), status: "cancelled" })
        .in("id", removed.map((r) => r.id));
      if (error) {
        console.error("[social_posts.saveTargets]", error.message);
        return null;
      }
    }
    return listPostTargets(projectId, { postIds: [postId] });
  } catch (e) {
    console.error("[social_posts.saveTargets]", e);
    return null;
  }
}

export async function updatePostTarget(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TARGETS)
      .update(postTargetToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[social_posts.updateTarget]", error.message);
      return null;
    }
    return normalizePostTarget(data);
  } catch (e) {
    console.error("[social_posts.updateTarget]", e);
    return null;
  }
}
