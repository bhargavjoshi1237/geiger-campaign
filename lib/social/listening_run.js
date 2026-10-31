import { graphRequest } from "./meta_graph";
import { connectionUsable, graphAuth } from "./credentials";
import { containsTerm } from "./moderation_eval";
import { networkForChannel } from "./networks";
import { classifySentiments } from "./ai_classify";
import { loadConnection } from "@/lib/messaging/connections";
import { HASHTAG_LIMIT, hashtagFor, hashtagsInWindow } from "./listening_limits";

// Listening over what the official APIs actually expose (server-only, service-role db):
//   hashtags — Instagram Hashtag Search (ig_hashtag_search -> recent_media / top_media), 30 unique hashtags per
//              account per rolling 7 days (enforced here, see listening_limits.js), recent media covers the last 24 hours
//   tags     — media the connected Instagram account is tagged in (/{ig-user-id}/tags)
//   comments — inbound comments on the project's own posts already in the inbox (every connected network)
// Results upsert into campaign.listening_mentions; sentiment is classified only when the LLM is configured.

const MAX_HASHTAGS_PER_RUN = 5;
const MEDIA_FIELDS = "id,caption,media_type,permalink,timestamp,like_count,comments_count";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export { hashtagFor };

function matchTerms(text, terms) {
  const t = String(text || "");
  return terms.filter((term) => containsTerm(t, term.replace(/^#/, "")) || (term.startsWith("#") && t.toLowerCase().includes(term.toLowerCase())));
}

const excludedBy = (text, excluded) => excluded.some((term) => containsTerm(String(text || ""), term.replace(/^#/, "")));

async function instagramConnections(db, projectId) {
  const { data } = await db
    .from("channel_connections")
    .select("*")
    .eq("project_id", projectId)
    .eq("channel", "instagram")
    .eq("status", "connected")
    .is("deleted_at", null)
    .limit(5);
  const out = [];
  for (const row of data || []) {
    const { connection, secrets } = await loadConnection(db, projectId, "instagram", row.id);
    if (connectionUsable(connection)) out.push({ connection, auth: graphAuth(connection, secrets) });
  }
  return out;
}

function mediaMention(query, connection, item, source, terms) {
  return {
    project_id: query.project_id,
    query_id: query.id,
    connection_id: connection.id,
    network: "instagram",
    source,
    external_id: String(item.id),
    text: String(item.caption || "").slice(0, 4000),
    author: item.username || "",
    url: item.permalink || null,
    matched_terms: terms,
    engagement: { likes: Number(item.like_count) || 0, comments: Number(item.comments_count) || 0 },
    posted_at: item.timestamp || null,
  };
}

export async function runListeningQuery(db, { query, now = new Date() }) {
  const terms = (query.terms || []).map((t) => String(t).trim()).filter(Boolean);
  const excluded = (query.excluded || []).map((t) => String(t).trim()).filter(Boolean);
  const networks = query.networks?.length ? query.networks : ["instagram"];
  const sources = query.sources?.length ? query.sources : ["hashtags", "tags", "comments"];
  const meta = bag(query.metadata);
  const hashtagIds = { ...bag(meta.hashtagIds) };
  const rows = [];
  const errors = [];

  const wantsInstagram = networks.includes("instagram") && (sources.includes("hashtags") || sources.includes("tags"));
  const igAccounts = wantsInstagram ? await instagramConnections(db, query.project_id) : [];
  if (wantsInstagram && !igAccounts.length) errors.push("No connected Instagram account — hashtag and tag search need one.");

  const primary = igAccounts[0];
  const queriedAt = { ...bag(meta.hashtagQueriedAt) };
  if (primary && sources.includes("hashtags")) {
    const hashtags = [...new Set(terms.map(hashtagFor).filter(Boolean))].slice(0, MAX_HASHTAGS_PER_RUN);
    // The 30-per-7-days budget is shared by every query in the project (they all search through the same account).
    // Deleted queries still count: Instagram keeps a searched hashtag in the window either way.
    const { data: siblings } = await db.from("listening_queries").select("id, metadata").eq("project_id", query.project_id);
    const inWindow = hashtagsInWindow((siblings || []).filter((q) => q.id !== query.id).concat({ metadata: { hashtagQueriedAt: queriedAt } }), now.getTime());
    for (const tag of hashtags) {
      if (!inWindow.has(tag) && inWindow.size >= HASHTAG_LIMIT) {
        errors.push(`#${tag}: skipped — Instagram allows ${HASHTAG_LIMIT} unique hashtags per 7 days and they're all in use.`);
        continue;
      }
      let hashtagId = hashtagIds[tag];
      if (!hashtagId) {
        const search = await graphRequest("ig_hashtag_search", { token: primary.auth.token, query: { user_id: primary.auth.nodeId, q: tag } });
        if (!search.ok) {
          errors.push(`#${tag}: ${search.error}`);
          continue;
        }
        hashtagId = search.data?.data?.[0]?.id;
        if (!hashtagId) continue;
        hashtagIds[tag] = hashtagId;
      }
      queriedAt[tag] = now.toISOString();
      inWindow.set(tag, now.getTime());
      for (const [edge, source] of [["recent_media", "hashtag_recent"], ["top_media", "hashtag_top"]]) {
        const res = await graphRequest(`${hashtagId}/${edge}`, { token: primary.auth.token, query: { user_id: primary.auth.nodeId, fields: MEDIA_FIELDS, limit: 50 } });
        if (!res.ok) {
          errors.push(`#${tag} ${edge}: ${res.error}`);
          continue;
        }
        for (const item of res.data?.data || []) {
          if (excludedBy(item.caption, excluded)) continue;
          const matched = matchTerms(item.caption, terms);
          rows.push(mediaMention(query, primary.connection, item, source, matched.length ? matched : [`#${tag}`]));
        }
      }
    }
  }

  if (sources.includes("tags")) {
    for (const { connection, auth } of igAccounts) {
      const res = await graphRequest(`${auth.nodeId}/tags`, { token: auth.token, host: auth.host, query: { fields: `${MEDIA_FIELDS},username`, limit: 50 } });
      if (!res.ok) {
        errors.push(`Tagged media: ${res.error}`);
        continue;
      }
      for (const item of res.data?.data || []) {
        if (excludedBy(item.caption, excluded)) continue;
        const matched = matchTerms(item.caption, terms);
        if (terms.length && !matched.length) continue;
        rows.push(mediaMention(query, connection, item, "tag", matched));
      }
    }
  }

  if (sources.includes("comments") && terms.length) {
    const since = query.last_run_at || new Date(now.getTime() - 7 * 86_400_000).toISOString();
    const { data: threads } = await db
      .from("conversations")
      .select("id, channel, connection_id, title, metadata")
      .eq("project_id", query.project_id)
      .eq("kind", "comment")
      .is("deleted_at", null)
      .gte("last_message_at", since)
      .limit(500);
    const byThread = new Map((threads || []).map((t) => [t.id, t]));
    const ids = [...byThread.keys()];
    for (let i = 0; i < ids.length; i += 100) {
      const { data: messages } = await db
        .from("conversation_messages")
        .select("id, conversation_id, body, external_id, sent_at, metadata")
        .in("conversation_id", ids.slice(i, i + 100))
        .eq("direction", "inbound")
        .gte("sent_at", since)
        .is("deleted_at", null)
        .limit(2000);
      for (const m of messages || []) {
        const thread = byThread.get(m.conversation_id);
        const network = networkForChannel(thread?.channel) || thread?.channel || "instagram";
        if (!networks.includes(network) && !(network === "facebook" && networks.includes("messenger"))) continue;
        if (excludedBy(m.body, excluded)) continue;
        const matched = matchTerms(m.body, terms);
        if (!matched.length) continue;
        const meta = bag(m.metadata);
        rows.push({
          project_id: query.project_id,
          query_id: query.id,
          connection_id: thread?.connection_id || null,
          network,
          source: "comment",
          external_id: String(m.external_id || m.id),
          text: String(m.body || "").slice(0, 4000),
          author: meta.authorName || meta.senderName || thread?.title || "",
          url: meta.permalink || null,
          matched_terms: matched,
          engagement: {},
          posted_at: m.sent_at,
        });
      }
    }
  }

  const unique = [...new Map(rows.map((r) => [`${r.network}:${r.external_id}`, r])).values()];
  let inserted = 0;
  if (unique.length) {
    const { data, error } = await db
      .from("listening_mentions")
      .upsert(unique, { onConflict: "query_id,network,external_id" })
      .select("id, text, sentiment");
    if (error) errors.push(error.message);
    else {
      inserted = data?.length || 0;
      const unclassified = (data || []).filter((m) => !m.sentiment).map((m) => ({ id: m.id, text: m.text }));
      const sentiments = await classifySentiments(unclassified);
      for (const [id, sentiment] of sentiments) await db.from("listening_mentions").update({ sentiment }).eq("id", id);
    }
  }

  await db
    .from("listening_queries")
    .update({
      last_run_at: now.toISOString(),
      last_error: errors.length ? errors.join(" · ").slice(0, 1000) : null,
      metadata: { ...meta, hashtagIds, hashtagQueriedAt: queriedAt },
    })
    .eq("id", query.id);
  return { mentions: inserted, errors };
}

// Worker entry: runs active queries not run in the last hour (all projects), bounded.
export async function runDueListening(db, { now = new Date(), deadline = Date.now() + 60_000, limit = 5 } = {}) {
  const cutoff = now.getTime() - 3600_000;
  const { data: queries } = await db
    .from("listening_queries")
    .select("*")
    .eq("active", true)
    .is("deleted_at", null)
    .order("last_run_at", { ascending: true, nullsFirst: true })
    .limit(100);
  const due = (queries || []).filter((q) => !q.last_run_at || new Date(q.last_run_at).getTime() < cutoff).slice(0, limit);
  const summary = { queries: 0, mentions: 0, errors: 0 };
  for (const query of due) {
    if (Date.now() > deadline) break;
    const res = await runListeningQuery(db, { query, now });
    summary.queries += 1;
    summary.mentions += res.mentions;
    summary.errors += res.errors.length;
  }
  return summary;
}
