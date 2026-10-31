// Playground stand-ins for the Communities API, answered from the in-memory seed. There is no Telegram
// bot here, so nothing is sent: linking activates the chat the sample bot "detected" (or adds the one you
// typed with no member count), posting marks the post published, and invite links get playground URLs.

import { getPlaygroundDb } from "../db.js";
import { json } from "../intercept_fetch.js";

const now = () => new Date().toISOString();
const uuid = () => globalThis.crypto.randomUUID();
const live = (row) => row && row.deleted_at == null;
const TELEGRAM = new Set(["telegram_channel", "telegram_group"]);
const RULES = [
  { kind: "banned_words", name: "Banned words", action: "warn", config: { words: [] } },
  { kind: "block_links", name: "Block links", action: "delete", config: { allowDomains: [] } },
  { kind: "flood", name: "Flood limit", action: "restrict", config: { maxMessages: 5, perSeconds: 10, restrictMinutes: 10 } },
];

function stamp(row) {
  const at = now();
  return { id: uuid(), metadata: {}, created_at: at, updated_at: at, deleted_at: null, ...row };
}

function channel(projectId, id) {
  return getPlaygroundDb().table("community_channels").find((c) => c.id === id && c.project_id === projectId && live(c));
}

function slugFor(db, name) {
  const base = String(name || "join").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "join";
  const taken = new Set(db.table("join_links").map((l) => l.slug));
  let slug = base.length >= 3 ? base : `${base}-link`;
  for (let i = 2; taken.has(slug); i += 1) slug = `${base}-${i}`;
  return slug;
}

function link({ params, body }) {
  const db = getPlaygroundDb();
  const ref = String(body?.chat || "").trim().replace(/^https?:\/\/t\.me\//i, "").replace(/^@/, "");
  if (!body?.connectionId) return json({ error: "Pick the bot to link with." }, 400);
  if (!ref) return json({ error: "Enter the chat's @username, t.me link or numeric id." }, 400);
  const rows = db.table("community_channels");
  let row = rows.find(
    (c) => c.project_id === params.projectId && live(c) && (c.external_chat_id === ref || c.handle.toLowerCase() === ref.toLowerCase()),
  );
  const platform = body.platform || row?.platform || "telegram_channel";
  if (row && row.platform !== platform) {
    return json({ error: row.platform === "telegram_group" ? "That's a group, not a channel. Link it from Communities → Groups." : "That's a channel, not a group. Link it from Communities → Telegram Channels." }, 422);
  }
  const warnings = [];
  if (row) {
    Object.assign(row, { status: "active", connection_id: body.connectionId, last_synced_at: now(), updated_at: now() });
  } else {
    row = stamp({
      project_id: params.projectId,
      platform,
      connection_id: body.connectionId,
      external_chat_id: /^-?\d+$/.test(ref) ? ref : `@${ref}`,
      name: ref,
      handle: /^-?\d+$/.test(ref) ? "" : ref,
      invite_url: /^-?\d+$/.test(ref) ? "" : `https://t.me/${ref}`,
      follower_count: 0,
      status: "active",
      settings: { rights: { isAdmin: true, canPost: true, canDelete: true, canRestrict: true, canInvite: true, checkedAt: now() } },
      last_synced_at: now(),
    });
    rows.push(row);
    warnings.push("Playground: no Telegram call was made, so the member count starts at 0.");
  }
  if (platform === "telegram_group" && !db.table("community_groups").some((g) => g.channel_id === row.id && live(g))) {
    const group = stamp({
      project_id: params.projectId,
      channel_id: row.id,
      welcome_enabled: false,
      welcome_text: "Welcome to {group}, {first_name}! Please read the pinned message before posting.",
      welcome_buttons: [],
      clean_service_messages: false,
      exempt_admins: true,
      warn_limit: 3,
      escalation_action: "restrict",
    });
    db.table("community_groups").push(group);
    RULES.forEach((r, i) => db.table("group_rules").push(stamp({ ...r, project_id: params.projectId, group_id: group.id, enabled: false, sort: i })));
  }
  db.table("member_snapshots").push(
    stamp({ project_id: params.projectId, channel_id: row.id, count: row.follower_count, captured_at: now(), source: "telegram_api", note: "" }),
  );
  return { channel: row, warnings };
}

export const communitiesRoutes = [
  ["POST", "/api/projects/:projectId/communities/telegram/link", link],

  ["POST", "/api/projects/:projectId/communities/channels/:channelId/verify", ({ params }) => {
    const row = channel(params.projectId, params.channelId);
    if (!row) return json({ error: "Channel not found." }, 404);
    Object.assign(row, { status: "active", last_synced_at: now(), settings: { ...row.settings, statusReason: null } });
    return { channel: row, warnings: [] };
  }],

  ["POST", "/api/projects/:projectId/communities/channels/:channelId/sync", ({ params }) => {
    const row = channel(params.projectId, params.channelId);
    if (!row) return json({ error: "Channel not found." }, 404);
    if (!TELEGRAM.has(row.platform)) return json({ error: "Record WhatsApp and Instagram follower counts by hand." }, 400);
    const snapshot = stamp({ project_id: row.project_id, channel_id: row.id, count: row.follower_count, captured_at: now(), source: "telegram_api", note: "" });
    getPlaygroundDb().table("member_snapshots").push(snapshot);
    row.last_synced_at = now();
    return { channel: row, snapshot };
  }],

  ["POST", "/api/projects/:projectId/communities/join-links", ({ params, body }) => {
    const db = getPlaygroundDb();
    const row = channel(params.projectId, body?.channelId);
    if (!row) return json({ error: "Channel not found." }, 404);
    const telegram = TELEGRAM.has(row.platform);
    if (!telegram && !row.invite_url) {
      return json({ error: "Add the channel's invite link in its settings first — that's where the short link sends people." }, 409);
    }
    const slug = body?.slug ? String(body.slug).toLowerCase() : slugFor(db, body?.name);
    if (db.table("join_links").some((l) => l.slug === slug)) return json({ error: "That slug is already taken." }, 409);
    const created = stamp({
      project_id: params.projectId,
      channel_id: row.id,
      slug,
      name: String(body?.name || "").trim() || "Join link",
      platform_url: telegram ? `https://t.me/+playground-${slug}` : row.invite_url,
      utm: body?.utm || {},
      clicks: 0,
      joins: 0,
      last_click_at: null,
      last_join_at: null,
      created_by: null,
    });
    db.table("join_links").push(created);
    return { link: created };
  }],

  ["DELETE", "/api/projects/:projectId/communities/join-links/:linkId", ({ params }) => {
    const row = getPlaygroundDb().table("join_links").find((l) => l.id === params.linkId && l.project_id === params.projectId && live(l));
    if (!row) return json({ error: "Join link not found." }, 404);
    row.deleted_at = now();
    return { ok: true, revoked: true };
  }],

  ["POST", "/api/projects/:projectId/communities/posts/:postId/publish", ({ params }) => {
    const db = getPlaygroundDb();
    const post = db.table("community_posts").find((p) => p.id === params.postId && p.project_id === params.projectId && live(p));
    if (!post) return json({ error: "Post not found." }, 404);
    if (post.status === "posted") return json({ error: "This post is already published." }, 409);
    if (post.mode !== "automated") return json({ error: "Manual-assist posts are published by a person in the app." }, 409);
    const sent = db.table("community_posts").filter((p) => p.channel_id === post.channel_id && p.external_message_id).length;
    Object.assign(post, { status: "posted", posted_at: now(), external_message_id: String(900 + sent), error: null, updated_at: now() });
    return { post, ok: true, error: null };
  }],
];
