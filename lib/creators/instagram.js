import { graphRequest } from "@/lib/social/meta_graph";
import { loadConnection } from "@/lib/messaging/connections";
import { normalizeHandle, summarizeMedia } from "./metrics";

// Public Instagram metrics through the Graph API's business discovery (server-only): any Business or
// Creator account's followers and recent posts, read through the project's own connected Instagram
// professional account. Personal accounts aren't visible to the API, and there is no third-party index.

const MEDIA_SAMPLE = 12;

export class CreatorLookupError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// The connected Instagram account (its IG user id + token), or null when none is connected.
export async function instagramDiscoveryAccount(db, projectId) {
  const { connection, secrets } = await loadConnection(db, projectId, "instagram");
  if (!connection || connection.status !== "connected") return null;
  const config = connection.config || {};
  const igUserId = connection.external_id || config.igUserId || config.ig_user_id || config.instagramBusinessAccountId;
  const token =
    secrets?.accessToken || secrets?.access_token || secrets?.pageAccessToken || secrets?.page_access_token || secrets?.token;
  if (!igUserId || !token) return null;
  return { igUserId, token, handle: connection.display_handle || "" };
}

// Looks up one public Business/Creator account and computes its audience metrics.
export async function lookupInstagramCreator(db, projectId, rawHandle, now = new Date()) {
  const handle = normalizeHandle(rawHandle);
  if (!handle || !/^[a-z0-9._]{1,30}$/.test(handle)) {
    throw new CreatorLookupError(400, "Enter a valid Instagram username.", "invalid_handle");
  }
  const account = await instagramDiscoveryAccount(db, projectId);
  if (!account) {
    throw new CreatorLookupError(
      409,
      "Connect an Instagram professional account in Channels → Instagram to pull public metrics. You can still add this creator with manual metrics.",
      "not_connected",
    );
  }

  const fields =
    `business_discovery.username(${handle}){username,name,biography,website,profile_picture_url,` +
    `followers_count,follows_count,media_count,media.limit(${MEDIA_SAMPLE}){like_count,comments_count,timestamp,media_type,permalink}}`;
  const res = await graphRequest(account.igUserId, { token: account.token, query: { fields } });
  if (!res.ok) {
    const missing = /cannot be found|does not exist|Invalid user id|not.*business/i.test(res.error || "");
    throw new CreatorLookupError(
      missing ? 404 : 502,
      missing
        ? `@${handle} isn't a public Instagram Business or Creator account, so its metrics aren't available through the API.`
        : `Instagram returned an error: ${res.error}`,
      missing ? "not_found" : "graph_error",
    );
  }

  const bd = res.data?.business_discovery;
  if (!bd) throw new CreatorLookupError(404, `No public profile found for @${handle}.`, "not_found");
  const followers = Number(bd.followers_count) || 0;
  const summary = summarizeMedia(bd.media?.data || [], followers);

  return {
    handle: bd.username || handle,
    name: bd.name || "",
    biography: bd.biography || "",
    website: bd.website || "",
    avatarUrl: bd.profile_picture_url || "",
    audience: {
      network: "instagram",
      followers,
      follows: Number(bd.follows_count) || 0,
      mediaCount: Number(bd.media_count) || 0,
      ...summary,
      source: "business_discovery",
      refreshedAt: now.toISOString(),
      via: account.handle ? `@${account.handle}` : "connected account",
    },
  };
}
