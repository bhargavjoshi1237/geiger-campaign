import { isTelegramPlatform } from "./platforms";
import { sendPostReminder } from "./reminders";
import { loadTelegramBot, memberCount, publishToTelegram } from "./telegram";
import { validateTelegramPost } from "./telegram_format";

// communities worker job, run by app/api/internal/worker on every scheduler tick (server-only, service-role db):
// publishes due Telegram posts, sends manual-assist reminders for WhatsApp / Instagram channel posts and
// snapshots Telegram member counts once a day. Every row is claimed before work so ticks never double up.
export const name = "communities";

const BATCH = 25;
const SNAPSHOT_BATCH = 20;
const CLAIM_TTL_MS = 10 * 60 * 1000;
const SNAPSHOT_EVERY_MS = 24 * 60 * 60 * 1000;
const MAX_REMINDER_LEAD_MIN = 24 * 60;
const MAX_ATTEMPTS = 5;

async function claim(db, post, now) {
  const stale = new Date(now.getTime() - CLAIM_TTL_MS).toISOString();
  const { data } = await db
    .from("community_posts")
    .update({ claimed_at: now.toISOString() })
    .eq("id", post.id)
    .eq("status", "scheduled")
    .or(`claimed_at.is.null,claimed_at.lt."${stale}"`)
    .select("id")
    .maybeSingle();
  return Boolean(data);
}

function channelLoader(db) {
  const cache = new Map();
  return async (id) => {
    if (!cache.has(id)) {
      const { data } = await db.from("community_channels").select("*").eq("id", id).maybeSingle();
      cache.set(id, data || null);
    }
    return cache.get(id);
  };
}

function tokenLoader(db) {
  const cache = new Map();
  return async (projectId, connectionId) => {
    const key = `${projectId}:${connectionId}`;
    if (!cache.has(key)) cache.set(key, (await loadTelegramBot(db, projectId, connectionId)).token);
    return cache.get(key);
  };
}

async function publishDuePosts(db, now, deadline, summary) {
  const { data: due, error } = await db
    .from("community_posts")
    .select("*")
    .eq("status", "scheduled")
    .eq("mode", "automated")
    .lte("scheduled_at", now.toISOString())
    .is("deleted_at", null)
    .order("scheduled_at", { ascending: true })
    .limit(BATCH);
  if (error) {
    console.error("[communities.worker.publish]", error.message);
    return;
  }
  const getChannel = channelLoader(db);
  const getToken = tokenLoader(db);
  for (const post of due || []) {
    if (Date.now() > deadline) break;
    if (!(await claim(db, post, now))) continue;
    const channel = await getChannel(post.channel_id);
    const fail = async (message) => {
      await db.from("community_posts").update({ status: "failed", error: message, claimed_at: null }).eq("id", post.id);
      summary.failed += 1;
    };
    if (!channel || channel.deleted_at) {
      await fail("The channel was removed before this post went out.");
      continue;
    }
    if (!isTelegramPlatform(channel.platform)) {
      await fail("Only Telegram posts can be published automatically.");
      continue;
    }
    const problem = validateTelegramPost(post);
    if (problem) {
      await fail(problem);
      continue;
    }
    const token = await getToken(channel.project_id, channel.connection_id);
    const result = await publishToTelegram(token, channel.external_chat_id, post, channel.settings?.defaults);
    if (result.ok) {
      await db
        .from("community_posts")
        .update({ status: "posted", posted_at: new Date().toISOString(), external_message_id: result.messageId, error: null, claimed_at: null })
        .eq("id", post.id);
      summary.published += 1;
      continue;
    }
    // Rate limits are transient: leave the post scheduled for the next tick, up to MAX_ATTEMPTS.
    const attempts = Number(post.metadata?.attempts || 0) + 1;
    if (/rate-limiting|couldn't reach telegram/i.test(result.error || "") && attempts < MAX_ATTEMPTS) {
      await db
        .from("community_posts")
        .update({ claimed_at: null, error: result.error, metadata: { ...(post.metadata || {}), attempts } })
        .eq("id", post.id);
      summary.retrying += 1;
      continue;
    }
    await fail(result.error);
  }
}

async function sendDueReminders(db, now, deadline, summary) {
  const horizon = new Date(now.getTime() + MAX_REMINDER_LEAD_MIN * 60_000).toISOString();
  const { data: upcoming, error } = await db
    .from("community_posts")
    .select("*")
    .eq("status", "scheduled")
    .eq("mode", "manual_assist")
    .lte("scheduled_at", horizon)
    .is("deleted_at", null)
    .order("scheduled_at", { ascending: true })
    .limit(BATCH * 4);
  if (error) {
    console.error("[communities.worker.reminders]", error.message);
    return;
  }
  const getChannel = channelLoader(db);
  for (const post of upcoming || []) {
    if (Date.now() > deadline) break;
    const channel = await getChannel(post.channel_id);
    if (!channel || channel.deleted_at) continue;
    const leadMinutes = Math.min(MAX_REMINDER_LEAD_MIN, Math.max(0, Number(channel.settings?.reminderLeadMinutes) || 0));
    if (new Date(post.scheduled_at).getTime() - leadMinutes * 60_000 > now.getTime()) continue;
    if (!(await claim(db, post, now))) continue;
    const outcome = await sendPostReminder(db, { post, channel, now });
    await db
      .from("community_posts")
      .update({
        status: "reminder_sent",
        reminder_sent_at: new Date().toISOString(),
        claimed_at: null,
        error: outcome.error,
        metadata: { ...(post.metadata || {}), reminder: { ...outcome, at: now.toISOString() } },
      })
      .eq("id", post.id);
    summary.reminders += 1;
  }
}

async function snapshotTelegramCounts(db, now, deadline, summary) {
  const cutoff = new Date(now.getTime() - SNAPSHOT_EVERY_MS).toISOString();
  const { data: channels, error } = await db
    .from("community_channels")
    .select("*")
    .in("platform", ["telegram_channel", "telegram_group"])
    .eq("status", "active")
    .is("deleted_at", null)
    .or(`last_synced_at.is.null,last_synced_at.lt."${cutoff}"`)
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(SNAPSHOT_BATCH);
  if (error) {
    console.error("[communities.worker.snapshots]", error.message);
    return;
  }
  const getToken = tokenLoader(db);
  for (const channel of channels || []) {
    if (Date.now() > deadline) break;
    const token = await getToken(channel.project_id, channel.connection_id);
    const count = token ? await memberCount(token, channel.external_chat_id) : null;
    const syncedAt = new Date().toISOString();
    if (count == null) {
      await db.from("community_channels").update({ last_synced_at: syncedAt }).eq("id", channel.id);
      continue;
    }
    await db.from("member_snapshots").insert({
      project_id: channel.project_id,
      channel_id: channel.id,
      count,
      captured_at: syncedAt,
      source: "telegram_api",
    });
    await db.from("community_channels").update({ follower_count: count, last_synced_at: syncedAt }).eq("id", channel.id);
    summary.snapshots += 1;
  }
}

export async function run({ db, now = new Date(), deadline = Number.POSITIVE_INFINITY } = {}) {
  const summary = { published: 0, failed: 0, retrying: 0, reminders: 0, snapshots: 0 };
  if (!db) return summary;
  await publishDuePosts(db, now, deadline, summary);
  await sendDueReminders(db, now, deadline, summary);
  await snapshotTelegramCounts(db, now, deadline, summary);
  // Flood windows are seconds long; day-old counters are dead weight.
  await db.from("group_flood_counters").delete().lt("window_started_at", new Date(now.getTime() - SNAPSHOT_EVERY_MS).toISOString());
  return summary;
}
