import { randomBytes } from "node:crypto";
import { recordEvent } from "@/lib/events/record";
import { ApiError, badRequest, notFound } from "@/lib/server/http";
import { BOT_USER_AGENT, isTelegramPlatform, normalizeSlug, RESERVED_SLUGS, SLUG_PATTERN } from "./platforms";
import { createInviteLink, revokeInviteLink } from "./telegram";
import { botTokenFor, getChannelRow, requireAdmin } from "./service";

// Join links (server-only): /j/<slug> short links that redirect to a channel's join URL. Telegram links
// point at a named invite link the bot creates, so joins come back on chat_member updates and are
// attributed; WhatsApp and Instagram don't report joins, so their links attribute clicks only.

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const UTM_KEYS = ["source", "medium", "campaign", "content", "term"];

function randomSlug(length = 7) {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function cleanUtm(utm) {
  const out = {};
  for (const key of UTM_KEYS) {
    const value = String(utm?.[key] ?? "").trim().slice(0, 120);
    if (value) out[key] = value;
  }
  return out;
}

export async function createJoinLink(db, { projectId, userId, channelId, name, slug, utm, memberLimit, expiresAt, createsJoinRequest }) {
  const channel = await getChannelRow(db, projectId, channelId);
  const custom = slug ? normalizeSlug(slug) : null;
  if (custom && (!SLUG_PATTERN.test(custom) || RESERVED_SLUGS.has(custom))) {
    throw badRequest("Slugs are 3–40 lowercase letters, numbers and dashes.");
  }
  if (custom) {
    const { data: taken } = await requireAdmin().from("join_links").select("id").eq("slug", custom).maybeSingle();
    if (taken) throw new ApiError(409, "That slug is already taken.", "slug_taken");
  }

  const label = String(name || "").trim() || "Join link";
  let platformUrl = channel.invite_url;
  let token = null;
  const metadata = {};
  if (isTelegramPlatform(channel.platform)) {
    ({ token } = await botTokenFor(projectId, channel.connection_id));
    const invite = await createInviteLink(token, channel.external_chat_id, { name: label, expiresAt, memberLimit, createsJoinRequest });
    if (!invite.ok || !invite.url) throw new ApiError(422, invite.error || "Telegram didn't return an invite link.", "telegram_error");
    platformUrl = invite.url;
    metadata.telegram = {
      memberLimit: Number(memberLimit) > 0 && !createsJoinRequest ? Number(memberLimit) : null,
      expiresAt: expiresAt || null,
      createsJoinRequest: Boolean(createsJoinRequest),
    };
  } else if (!platformUrl) {
    throw new ApiError(409, "Add the channel's invite link in its settings first — that's where the short link sends people.", "missing_invite_url");
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await db
      .from("join_links")
      .insert({
        project_id: projectId,
        channel_id: channel.id,
        slug: custom || randomSlug(),
        name: label,
        platform_url: platformUrl,
        utm: cleanUtm(utm),
        metadata,
        created_by: userId,
      })
      .select("*")
      .single();
    if (!error && data) return { link: data };
    if (error?.code !== "23505") {
      console.error("[communities.joinLinks.create]", error?.message);
      break;
    }
    if (custom) {
      if (token) await revokeInviteLink(token, channel.external_chat_id, platformUrl);
      throw new ApiError(409, "That slug is already taken.", "slug_taken");
    }
  }
  if (token) await revokeInviteLink(token, channel.external_chat_id, platformUrl);
  throw new ApiError(500, "Couldn't save the join link.", "db_error");
}

// Soft-deletes the link and revokes its Telegram invite link, so the old URL stops admitting people.
export async function revokeJoinLink(db, { projectId, linkId }) {
  const { data: link } = await db
    .from("join_links")
    .select("*")
    .eq("project_id", projectId)
    .eq("id", linkId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!link) throw notFound("Join link not found.");
  const { data: channel } = await db.from("community_channels").select("*").eq("id", link.channel_id).maybeSingle();

  let revoked = false;
  if (channel && isTelegramPlatform(channel.platform) && /t\.me\/\+/.test(link.platform_url)) {
    try {
      const { token } = await botTokenFor(projectId, channel.connection_id);
      revoked = (await revokeInviteLink(token, channel.external_chat_id, link.platform_url)).ok;
    } catch {
      revoked = false;
    }
  }
  const { error } = await db.from("join_links").update({ deleted_at: new Date().toISOString() }).eq("id", link.id);
  if (error) throw new ApiError(500, "Couldn't delete the join link.", "db_error");
  return { ok: true, revoked };
}

// Public redirect lookup (service-role db). Deleted links resolve to nothing.
export async function resolveJoinLink(admin, slug) {
  const value = normalizeSlug(slug);
  if (!admin || !value) return null;
  const { data } = await admin
    .from("join_links")
    .select("id, project_id, channel_id, slug, platform_url, utm, deleted_at")
    .eq("slug", value)
    .maybeSingle();
  if (!data || data.deleted_at || !data.platform_url) return null;
  return data;
}

// Counts a human click and records community_join_click with the link's UTM (query utm_* override it).
export async function recordJoinClick(admin, link, { url, referrer, userAgent }) {
  if (!admin || !link || BOT_USER_AGENT.test(userAgent || "")) return { counted: false };
  const params = url ? new URL(url).searchParams : new URLSearchParams();
  const utm = { ...(link.utm || {}) };
  for (const key of UTM_KEYS) {
    const value = params.get(`utm_${key}`);
    if (value) utm[key] = value.slice(0, 120);
  }
  const { data: channel } = await admin.from("community_channels").select("platform").eq("id", link.channel_id).maybeSingle();
  const { error } = await admin.rpc("join_link_bump", { p_id: link.id, p_clicks: 1, p_joins: 0 });
  if (error) console.error("[communities.joinClick.bump]", error.message);
  await recordEvent(admin, {
    projectId: link.project_id,
    name: "community_join_click",
    properties: { joinLinkId: link.id, channelId: link.channel_id, platform: channel?.platform || null, slug: link.slug },
    source: "web",
    url,
    referrer: referrer || null,
    utm,
  });
  return { counted: true };
}

// A Telegram member joined through one of our invite links: bump the link and record community_join.
export async function recordTelegramJoin(db, { projectId, channel, inviteLink, user, viaJoinRequest = false }) {
  const url = inviteLink?.invite_link;
  if (!url || !user) return null;
  const { data: link } = await db
    .from("join_links")
    .select("id, utm")
    .eq("project_id", projectId)
    .eq("channel_id", channel.id)
    .eq("platform_url", url)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (!link) return null;
  const { error } = await db.rpc("join_link_bump", { p_id: link.id, p_clicks: 0, p_joins: 1 });
  if (error) console.error("[communities.join.bump]", error.message);
  const { data: contact } = await db
    .from("contacts")
    .select("id")
    .eq("project_id", projectId)
    .eq("metadata->identities->>telegram", String(user.id))
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  await recordEvent(db, {
    projectId,
    contactId: contact?.id ?? null,
    name: "community_join",
    properties: {
      joinLinkId: link.id,
      channelId: channel.id,
      platform: channel.platform,
      telegramUserId: String(user.id),
      username: user.username || null,
      viaJoinRequest: Boolean(viaJoinRequest),
    },
    source: "social",
    utm: link.utm || {},
  });
  return link.id;
}
