import { graphRequest } from "@/lib/social/meta_graph";
import { graphHost, graphToken } from "./store";

// Live post / ad listing for the comment-to-DM picker (server-only): reads the connected Instagram account's
// media or the Facebook Page's posts through the Graph API, and ads from the ad account in the connection
// config. Returns { connected, items, error } — never throws.

const IG_FIELDS = "id,caption,media_type,media_product_type,thumbnail_url,media_url,permalink,timestamp,comments_count";
const FB_FIELDS = "id,message,created_time,permalink_url,full_picture";
const AD_FIELDS = "id,name,effective_status,creative{thumbnail_url,effective_object_story_id}";

export async function listConnectionMedia({ connection, secrets, kind = "posts" }) {
  const token = graphToken(secrets);
  if (!connection || connection.status !== "connected" || !token) {
    return { connected: false, items: [], error: "Connect the account to pick posts, or enter post ids by hand." };
  }
  const host = graphHost(connection);

  if (kind === "ads") {
    const account = String(connection.config?.adAccountId || "").replace(/^act_/, "");
    if (!account) return { connected: true, items: [], error: "No ad account is linked to this connection — enter ad ids by hand." };
    const res = await graphRequest(`act_${account}/ads`, { token, query: { fields: AD_FIELDS, limit: 50 } });
    if (!res.ok) return { connected: true, items: [], error: res.error };
    return {
      connected: true,
      error: null,
      items: (res.data?.data || []).map((ad) => ({
        id: ad.id,
        caption: ad.name || ad.id,
        status: ad.effective_status || "",
        thumbnailUrl: ad.creative?.thumbnail_url || "",
        storyId: ad.creative?.effective_object_story_id || null,
        kind: "ad",
      })),
    };
  }

  if (!connection.external_id) return { connected: true, items: [], error: "The connection has no account id yet." };
  if (connection.channel === "instagram") {
    const res = await graphRequest(`${connection.external_id}/media`, { token, query: { fields: IG_FIELDS, limit: 30 }, host });
    if (!res.ok) return { connected: true, items: [], error: res.error };
    return {
      connected: true,
      error: null,
      items: (res.data?.data || []).map((m) => ({
        id: m.id,
        caption: m.caption || "",
        mediaType: m.media_product_type === "REELS" ? "REEL" : m.media_type || "",
        thumbnailUrl: m.thumbnail_url || m.media_url || "",
        permalink: m.permalink || "",
        timestamp: m.timestamp || null,
        commentsCount: Number(m.comments_count || 0),
        kind: "post",
      })),
    };
  }
  const res = await graphRequest(`${connection.external_id}/posts`, { token, query: { fields: FB_FIELDS, limit: 30 }, host });
  if (!res.ok) return { connected: true, items: [], error: res.error };
  return {
    connected: true,
    error: null,
    items: (res.data?.data || []).map((p) => ({
      id: p.id,
      caption: p.message || "",
      mediaType: "POST",
      thumbnailUrl: p.full_picture || "",
      permalink: p.permalink_url || "",
      timestamp: p.created_time || null,
      commentsCount: null,
      kind: "post",
    })),
  };
}
