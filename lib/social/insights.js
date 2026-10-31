import { graphRequest } from "./meta_graph";
import { telegramRequest } from "./telegram";
import { connectionUsable, graphAuth, telegramAuth } from "./credentials";
import { loadConnection } from "@/lib/messaging/connections";
import { networkForChannel } from "./networks";

// Insights refresh (server-only, service-role db): pulls account-level and per-post metrics from the Graph API
// (Instagram, Facebook Page) and the Bot API (Telegram channel member count), stores them as
// campaign.social_metric_snapshots and copies the latest post metrics onto social_post_targets.metrics.
// Metrics the platform has deprecated or doesn't grant are skipped, never estimated.

const STALE_MS = 6 * 3600_000;
const POST_WINDOW_DAYS = 60;
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

// Reads a Graph insights response ({ data: [{ name, values | total_value }] }) into { metric: number }.
function readInsights(data) {
  const out = {};
  for (const entry of Array.isArray(data?.data) ? data.data : []) {
    const value = entry.total_value?.value ?? entry.values?.[entry.values.length - 1]?.value;
    if (typeof value === "number") out[entry.name] = value;
  }
  return out;
}

// Tries the full metric list first, then each metric alone, so one deprecated metric doesn't sink the rest.
async function tolerantInsights(path, metrics, auth, extraQuery = {}) {
  const res = await graphRequest(`${path}/insights`, { token: auth.token, host: auth.host, query: { metric: metrics.join(","), ...extraQuery } });
  if (res.ok) return readInsights(res.data);
  const out = {};
  for (const metric of metrics) {
    const one = await graphRequest(`${path}/insights`, { token: auth.token, host: auth.host, query: { metric, ...extraQuery } });
    if (one.ok) Object.assign(out, readInsights(one.data));
  }
  return out;
}

function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined));
}

async function instagramAccount(auth) {
  const profile = await graphRequest(auth.nodeId, { token: auth.token, host: auth.host, query: { fields: "followers_count,follows_count,media_count,username" } });
  if (!profile.ok) return { error: profile.error };
  const insights = await tolerantInsights(auth.nodeId, ["reach", "views", "accounts_engaged", "total_interactions", "likes", "comments", "shares", "saves", "profile_links_taps"], auth, { period: "day", metric_type: "total_value" });
  return {
    metrics: compact({
      followers: num(profile.data?.followers_count),
      follows: num(profile.data?.follows_count),
      mediaCount: num(profile.data?.media_count),
      reach: num(insights.reach),
      views: num(insights.views),
      accountsEngaged: num(insights.accounts_engaged),
      engagement: num(insights.total_interactions),
      likes: num(insights.likes),
      comments: num(insights.comments),
      shares: num(insights.shares),
      saves: num(insights.saves),
      profileLinksTaps: num(insights.profile_links_taps),
      period: "day",
    }),
  };
}

async function facebookAccount(auth) {
  const profile = await graphRequest(auth.nodeId, { token: auth.token, query: { fields: "followers_count,fan_count,name" } });
  if (!profile.ok) return { error: profile.error };
  const insights = await tolerantInsights(auth.nodeId, ["page_impressions_unique", "page_post_engagements", "page_media_view"], { ...auth, host: "graph.facebook.com" }, { period: "day" });
  return {
    metrics: compact({
      followers: num(profile.data?.followers_count ?? profile.data?.fan_count),
      reach: num(insights.page_impressions_unique),
      views: num(insights.page_media_view),
      engagement: num(insights.page_post_engagements),
      period: "day",
    }),
  };
}

async function telegramAccount(auth) {
  if (!auth.token || !auth.chatId) return { error: "No Telegram channel set for this bot." };
  const res = await telegramRequest(auth.token, "getChatMemberCount", { chat_id: auth.chatId });
  if (!res.ok) return { error: res.error };
  return { metrics: { followers: num(res.data) } };
}

async function instagramPost(auth, mediaId) {
  const info = await graphRequest(mediaId, { token: auth.token, host: auth.host, query: { fields: "like_count,comments_count,media_product_type" } });
  if (!info.ok) return { error: info.error };
  const story = info.data?.media_product_type === "STORY";
  const insights = await tolerantInsights(mediaId, story ? ["reach", "views", "replies"] : ["reach", "views", "likes", "comments", "shares", "saved", "total_interactions"], auth);
  const likes = num(insights.likes ?? info.data?.like_count);
  const comments = num(insights.comments ?? info.data?.comments_count);
  const shares = num(insights.shares);
  const saves = num(insights.saved);
  return {
    metrics: compact({
      reach: num(insights.reach),
      views: num(insights.views),
      likes,
      comments,
      shares,
      saves,
      replies: num(insights.replies),
      engagement: num(insights.total_interactions) ?? (likes ?? 0) + (comments ?? 0) + (shares ?? 0) + (saves ?? 0),
    }),
  };
}

async function facebookPost(auth, postId) {
  const info = await graphRequest(postId, {
    token: auth.token,
    query: { fields: "shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)" },
  });
  if (!info.ok) return { error: info.error };
  const insights = await tolerantInsights(postId, ["post_impressions_unique", "post_clicks"], { ...auth, host: "graph.facebook.com" });
  const reactions = num(info.data?.reactions?.summary?.total_count) ?? 0;
  const comments = num(info.data?.comments?.summary?.total_count) ?? 0;
  const shares = num(info.data?.shares?.count) ?? 0;
  return {
    metrics: compact({
      reach: num(insights.post_impressions_unique),
      clicks: num(insights.post_clicks),
      reactions,
      likes: reactions,
      comments,
      shares,
      engagement: reactions + comments + shares,
    }),
  };
}

export async function captureAccountSnapshot(db, { connection, secrets, now = new Date() }) {
  const network = networkForChannel(connection.channel);
  let result;
  if (network === "instagram") result = await instagramAccount(graphAuth(connection, secrets));
  else if (network === "facebook") result = await facebookAccount(graphAuth(connection, secrets));
  else if (network === "telegram") result = await telegramAccount(telegramAuth(connection, secrets));
  else return { skipped: true };
  if (result.error) return { error: result.error };
  const { error } = await db.from("social_metric_snapshots").insert({
    project_id: connection.project_id,
    connection_id: connection.id,
    network,
    scope: "account",
    metrics: result.metrics,
    captured_at: now.toISOString(),
  });
  if (error) return { error: error.message };
  return { metrics: result.metrics };
}

export async function capturePostSnapshot(db, { target, connection, secrets, now = new Date() }) {
  if (!target.external_id) return { skipped: true };
  let result;
  if (target.network === "instagram") result = await instagramPost(graphAuth(connection, secrets), target.external_id);
  else if (target.network === "facebook") result = await facebookPost(graphAuth(connection, secrets), target.external_id);
  else return { skipped: true };
  const meta = bag(target.metadata);
  if (result.error) {
    await db.from("social_post_targets").update({ metadata: { ...meta, lastInsightsAt: now.toISOString(), insightsError: result.error } }).eq("id", target.id);
    return { error: result.error };
  }
  await db.from("social_metric_snapshots").insert({
    project_id: target.project_id,
    connection_id: target.connection_id,
    target_id: target.id,
    network: target.network,
    scope: "post",
    metrics: result.metrics,
    captured_at: now.toISOString(),
  });
  await db
    .from("social_post_targets")
    .update({ metrics: result.metrics, metadata: { ...meta, lastInsightsAt: now.toISOString(), insightsError: null } })
    .eq("id", target.id);
  return { metrics: result.metrics };
}

// Refreshes stale account + post insights (all projects when projectId is null), bounded by deadline and limits.
export async function refreshInsights(db, { projectId = null, connectionId = null, now = new Date(), deadline = Date.now() + 25_000, force = false, maxAccounts = 10, maxPosts = 25 } = {}) {
  const summary = { accounts: 0, posts: 0, errors: [] };
  const staleBefore = now.getTime() - STALE_MS;

  let connQuery = db
    .from("channel_connections")
    .select("*")
    .in("channel", ["instagram", "messenger", "telegram"])
    .eq("status", "connected")
    .is("deleted_at", null)
    .limit(100);
  if (projectId) connQuery = connQuery.eq("project_id", projectId);
  if (connectionId) connQuery = connQuery.eq("id", connectionId);
  const { data: connections } = await connQuery;
  const byId = new Map();

  for (const row of connections || []) {
    if (Date.now() > deadline || summary.accounts >= maxAccounts) break;
    const { connection, secrets } = await loadConnection(db, row.project_id, row.channel, row.id);
    if (!connectionUsable(connection)) continue;
    byId.set(row.id, { connection, secrets });
    if (!force) {
      const { data: last } = await db
        .from("social_metric_snapshots")
        .select("captured_at")
        .eq("connection_id", row.id)
        .eq("scope", "account")
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (last && new Date(last.captured_at).getTime() > staleBefore) continue;
    }
    const res = await captureAccountSnapshot(db, { connection, secrets, now });
    if (res.error) summary.errors.push({ connectionId: row.id, error: res.error });
    else if (!res.skipped) summary.accounts += 1;
  }

  const since = new Date(now.getTime() - POST_WINDOW_DAYS * 86_400_000).toISOString();
  let targetQuery = db
    .from("social_post_targets")
    .select("*")
    .eq("status", "published")
    .in("network", ["instagram", "facebook"])
    .not("external_id", "is", null)
    .gte("published_at", since)
    .is("deleted_at", null)
    .order("published_at", { ascending: false })
    .limit(200);
  if (projectId) targetQuery = targetQuery.eq("project_id", projectId);
  if (connectionId) targetQuery = targetQuery.eq("connection_id", connectionId);
  const { data: targets } = await targetQuery;

  for (const target of targets || []) {
    if (Date.now() > deadline || summary.posts >= maxPosts) break;
    const last = bag(target.metadata).lastInsightsAt;
    if (!force && last && new Date(last).getTime() > staleBefore) continue;
    let creds = byId.get(target.connection_id);
    if (!creds) {
      const channel = target.network === "facebook" ? "messenger" : target.network;
      creds = await loadConnection(db, target.project_id, channel, target.connection_id);
      byId.set(target.connection_id, creds);
    }
    if (!connectionUsable(creds?.connection)) continue;
    const res = await capturePostSnapshot(db, { target, connection: creds.connection, secrets: creds.secrets, now });
    if (res.error) summary.errors.push({ targetId: target.id, error: res.error });
    else if (!res.skipped) summary.posts += 1;
  }
  return summary;
}
