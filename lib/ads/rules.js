import { graphRequest } from "@/lib/social/meta_graph";
import { insightMetric, ruleMetricMeta } from "./catalog";
import { resolveTokenForChannel } from "./accounts";
import { graphErrorMessage, setEntityStatus } from "./meta_ads";

// Ads rules (server-only, service-role db): automated rules over the latest insights snapshots (pause an
// entity whose metric crosses a threshold), and ad-comment routing — comment conversations on ads get
// ad context, inbox routing (assignee / priority / tags) and moderation (hide via the platform API).

const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const LINK = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|net|org|io|co|shop|store|link|ly|me)\b/i;

async function accountToken(db, accountId) {
  const { data } = await db.from("ad_account_secrets").select("secrets").eq("ad_account_id", accountId).maybeSingle();
  return data?.secrets?.accessToken || null;
}

// Evaluates active rules (optionally one project) against ACTIVE snapshots; pauses or logs matches.
export async function evaluateAdRules(db, { projectId = null, now = new Date(), deadline = Infinity } = {}) {
  let query = db.from("ad_rules").select("*").eq("status", "active").is("deleted_at", null).limit(200);
  if (projectId) query = query.eq("project_id", projectId);
  const { data: rules } = await query;
  const summary = { evaluated: 0, triggered: 0, results: [] };
  const tokens = new Map();
  for (const rule of rules || []) {
    if (Date.now() > deadline) break;
    summary.evaluated += 1;
    let snapQuery = db
      .from("ad_campaign_snapshots")
      .select("*")
      .eq("project_id", rule.project_id)
      .eq("level", rule.level)
      .eq("status", "ACTIVE")
      .is("deleted_at", null)
      .limit(1000);
    if (rule.ad_account_id) snapQuery = snapQuery.eq("ad_account_id", rule.ad_account_id);
    const { data: snaps } = await snapQuery;
    const scoped = (rule.scope_ids || []).length ? (snaps || []).filter((s) => rule.scope_ids.includes(s.external_id) || rule.scope_ids.includes(s.external_campaign_id)) : snaps || [];
    const history = Array.isArray(rule.history) ? [...rule.history] : [];
    let triggered = 0;
    for (const snap of scoped) {
      const insights = bag(snap.insights);
      if ((Number(insights.spend) || 0) < Number(rule.min_spend || 0)) continue;
      const value = insightMetric(insights, rule.metric);
      if (value == null) continue;
      const hit = rule.operator === "lt" ? value < Number(rule.threshold) : value > Number(rule.threshold);
      if (!hit) continue;
      let result = "logged";
      if (rule.action === "pause") {
        if (!tokens.has(snap.ad_account_id)) tokens.set(snap.ad_account_id, await accountToken(db, snap.ad_account_id));
        const token = tokens.get(snap.ad_account_id);
        if (!token) result = "no token";
        else {
          const res = await setEntityStatus(token, snap.external_id, "PAUSED");
          if (res.ok) {
            result = "paused";
            await db.from("ad_campaign_snapshots").update({ status: "PAUSED", effective_status: "PAUSED" }).eq("id", snap.id);
          } else result = `failed: ${graphErrorMessage(res)}`;
        }
      }
      triggered += 1;
      const entry = {
        at: now.toISOString(),
        entityId: snap.external_id,
        entityName: snap.name,
        metric: ruleMetricMeta(rule.metric).label,
        value: Math.round(value * 100) / 100,
        action: rule.action,
        result,
      };
      history.unshift(entry);
      summary.results.push({ ruleId: rule.id, ...entry });
    }
    summary.triggered += triggered;
    await db
      .from("ad_rules")
      .update({
        last_evaluated_at: now.toISOString(),
        ...(triggered ? { last_triggered_at: now.toISOString(), trigger_count: (rule.trigger_count || 0) + triggered, history: history.slice(0, 50) } : {}),
      })
      .eq("id", rule.id);
  }
  return summary;
}

// The ad a comment conversation belongs to: explicit ad id from ingest, else its post matched to an ad's dark post.
function adForConversation(conversation, adsById, adsByStory) {
  const meta = bag(conversation.metadata);
  const ctx = bag(meta.context);
  const adId = meta.ad?.adId || meta.adId || ctx.adId || null;
  if (adId && adsById.has(String(adId))) return adsById.get(String(adId));
  const postIds = [meta.postId, ctx.postId, meta.mediaId, ctx.mediaId, conversation.external_thread_id].filter(Boolean).map(String);
  for (const id of postIds) if (adsByStory.has(id)) return adsByStory.get(id);
  if (adId) return { external_id: String(adId), name: "", external_campaign_id: null, external_adset_id: null };
  return null;
}

function ruleCovers(rule, ad, channel) {
  if (rule.status !== "active") return false;
  if ((rule.channels || []).length && !rule.channels.includes(channel)) return false;
  if (rule.scope === "campaigns") return (rule.scope_ids || []).includes(ad.external_campaign_id);
  if (rule.scope === "ads") return (rule.scope_ids || []).includes(ad.external_id);
  return true;
}

function moderationReason(rule, text) {
  const body = String(text || "");
  if (rule.hide_all) return "comments off";
  if (rule.hide_links && LINK.test(body)) return "link";
  const lower = body.toLowerCase();
  const keyword = (rule.hide_keywords || []).find((k) => k && lower.includes(String(k).toLowerCase()));
  return keyword ? `keyword "${keyword}"` : null;
}

// Hides / unhides a comment on Facebook (is_hidden) or Instagram (hide) with the page token.
export async function setCommentHidden(db, { projectId, conversation, hidden }) {
  const meta = bag(conversation.metadata);
  const { data: message } = await db
    .from("conversation_messages")
    .select("id, external_id, metadata")
    .eq("conversation_id", conversation.id)
    .eq("direction", "inbound")
    .is("deleted_at", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const commentId = message?.external_id || meta.commentId || bag(meta.context).commentId;
  if (!commentId) return { ok: false, error: "No platform comment id on this thread." };
  const { data: connection } = conversation.connection_id
    ? await db.from("channel_connections").select("*").eq("id", conversation.connection_id).maybeSingle()
    : { data: null };
  const token = await resolveTokenForChannel(db, projectId, { channel: conversation.channel, externalId: connection?.external_id || null, connection });
  if (!token) return { ok: false, error: "No page token can act on this comment — connect the ad account or the page." };
  const body = conversation.channel === "instagram" ? { hide: hidden } : { is_hidden: hidden };
  const res = await graphRequest(String(commentId), { token, method: "POST", body });
  if (!res.ok) return { ok: false, error: graphErrorMessage(res, "Meta didn't hide the comment.") };
  return { ok: true, commentId };
}

// Stamps ad context, applies the first matching rule's routing and moderation to recent ad comments.
export async function routeAdComments(db, { projectId = null, now = new Date(), deadline = Infinity, sinceHours = 6, limit = 500 } = {}) {
  const since = new Date(now.getTime() - sinceHours * 3_600_000).toISOString();
  let query = db
    .from("conversations")
    .select("*")
    .eq("kind", "comment")
    .in("channel", ["messenger", "instagram"])
    .gte("last_message_at", since)
    .is("deleted_at", null)
    .order("last_message_at", { ascending: false })
    .limit(limit);
  if (projectId) query = query.eq("project_id", projectId);
  const { data: conversations } = await query;
  const summary = { scanned: (conversations || []).length, matched: 0, hidden: 0 };
  const byProject = new Map();
  for (const c of conversations || []) {
    if (bag(c.metadata).ad?.routedAt) continue;
    if (!byProject.has(c.project_id)) byProject.set(c.project_id, []);
    byProject.get(c.project_id).push(c);
  }
  for (const [pid, list] of byProject) {
    if (Date.now() > deadline) break;
    const [{ data: ads }, { data: campaigns }, { data: rules }] = await Promise.all([
      db.from("ad_campaign_snapshots").select("ad_account_id, external_id, name, external_campaign_id, external_adset_id, story_id, instagram_media_id").eq("project_id", pid).eq("level", "ad").is("deleted_at", null),
      db.from("ad_campaign_snapshots").select("external_id, name").eq("project_id", pid).eq("level", "campaign"),
      db.from("ad_comment_rules").select("*").eq("project_id", pid).is("deleted_at", null).order("position").order("created_at"),
    ]);
    const adsById = new Map((ads || []).map((a) => [a.external_id, a]));
    const adsByStory = new Map();
    for (const a of ads || []) {
      if (a.story_id) {
        adsByStory.set(a.story_id, a);
        const postPart = String(a.story_id).split("_")[1];
        if (postPart) adsByStory.set(postPart, a);
      }
      if (a.instagram_media_id) adsByStory.set(String(a.instagram_media_id), a);
    }
    const campaignNames = new Map((campaigns || []).map((c) => [c.external_id, c.name]));

    for (const conversation of list) {
      const ad = adForConversation(conversation, adsById, adsByStory);
      if (!ad) continue;
      summary.matched += 1;
      const rule = (rules || []).find((r) => ruleCovers(r, ad, conversation.channel)) || null;
      const context = {
        adId: ad.external_id,
        adName: ad.name || "",
        adsetId: ad.external_adset_id || null,
        campaignId: ad.external_campaign_id || null,
        campaignName: campaignNames.get(ad.external_campaign_id) || "",
        accountId: ad.ad_account_id || null,
        ruleId: rule?.id || null,
        routedAt: now.toISOString(),
      };
      const patch = { metadata: { ...bag(conversation.metadata), ad: context } };
      if (rule) {
        if (rule.route_to_inbox) {
          if (rule.assignee_id && !conversation.assignee_id) patch.assignee_id = rule.assignee_id;
          if (rule.priority) patch.priority = rule.priority;
          if ((rule.tags || []).length) patch.tags = [...new Set([...(conversation.tags || []), ...rule.tags])];
        } else if (conversation.status === "open") {
          patch.status = "resolved";
        }
        const { data: lastMessage } = await db
          .from("conversation_messages")
          .select("body")
          .eq("conversation_id", conversation.id)
          .eq("direction", "inbound")
          .order("sent_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const reason = moderationReason(rule, lastMessage?.body);
        let hidden = false;
        if (reason) {
          const res = await setCommentHidden(db, { projectId: pid, conversation, hidden: true });
          hidden = res.ok;
          context.moderation = { action: res.ok ? "hidden" : "hide_failed", reason, at: now.toISOString(), ...(res.ok ? {} : { error: res.error }) };
          if (res.ok) summary.hidden += 1;
        }
        await db
          .from("ad_comment_rules")
          .update({ matched_count: (rule.matched_count || 0) + 1, hidden_count: (rule.hidden_count || 0) + (hidden ? 1 : 0), last_matched_at: now.toISOString() })
          .eq("id", rule.id);
        rule.matched_count = (rule.matched_count || 0) + 1;
        rule.hidden_count = (rule.hidden_count || 0) + (hidden ? 1 : 0);
      }
      const { error } = await db.from("conversations").update(patch).eq("id", conversation.id);
      if (error) console.error("[ads.comments.route]", error.message);
    }
  }
  return summary;
}
