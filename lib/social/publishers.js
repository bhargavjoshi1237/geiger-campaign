import { graphRequest } from "./meta_graph";
import { telegramRequest } from "./telegram";

// Per-network publishers (server-only) over the official APIs. Each returns
//   { status: "published", externalId, permalink, meta } | { status: "pending", resume } | { status: "failed", error, transient }
// Instagram uses the content publishing flow (container -> status poll -> media_publish); long video processing
// returns "pending" with a resume state the worker picks up on its next tick, so nothing is ever published twice.

const POLL_MS = 3000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const transientStatus = (status) => status === 0 || status === 429 || status >= 500;
const fail = (res, prefix = "") => ({
  status: "failed",
  error: `${prefix}${res?.error || "Request failed"}`.slice(0, 500),
  transient: transientStatus(res?.status ?? 0),
});

// Instagram ------------------------------------------------------------------

async function igContainerState(id, auth) {
  const res = await graphRequest(id, { token: auth.token, host: auth.host, query: { fields: "status_code,status" } });
  if (!res.ok) return { code: "ERROR", detail: res.error };
  return { code: res.data?.status_code || "IN_PROGRESS", detail: res.data?.status || "" };
}

// Polls until every container is FINISHED, one errors, or the deadline passes.
async function igWaitFor(ids, auth, deadline) {
  let pending = [...ids];
  while (pending.length) {
    const states = await Promise.all(pending.map((id) => igContainerState(id, auth).then((s) => ({ id, ...s }))));
    const broken = states.find((s) => s.code === "ERROR" || s.code === "EXPIRED");
    if (broken) return { ready: false, error: `Instagram couldn't process the media (${broken.code.toLowerCase()}${broken.detail ? `: ${broken.detail}` : ""}).` };
    pending = states.filter((s) => s.code !== "FINISHED" && s.code !== "PUBLISHED").map((s) => s.id);
    if (!pending.length) return { ready: true };
    if (Date.now() + POLL_MS > deadline) return { ready: false, pending: true };
    await sleep(POLL_MS);
  }
  return { ready: true };
}

async function igCreate(auth, body) {
  let res = await graphRequest(`${auth.nodeId}/media`, { token: auth.token, host: auth.host, method: "POST", body });
  // Older Graph versions reject alt_text; retry once without it rather than failing the post.
  if (!res.ok && body.alt_text && /alt_text/i.test(res.error || "")) {
    const rest = { ...body };
    delete rest.alt_text;
    res = await graphRequest(`${auth.nodeId}/media`, { token: auth.token, host: auth.host, method: "POST", body: rest });
  }
  return res;
}

function igMediaBody(item, { carouselItem = false, format } = {}) {
  const isVideo = item.kind === "video";
  if (format === "story") return isVideo ? { media_type: "STORIES", video_url: item.url } : { media_type: "STORIES", image_url: item.url };
  if (format === "reel") return { media_type: "REELS", video_url: item.url, share_to_feed: true };
  if (isVideo) return { media_type: "VIDEO", video_url: item.url, ...(carouselItem ? { is_carousel_item: true } : {}) };
  return {
    image_url: item.url,
    ...(carouselItem ? { is_carousel_item: true } : {}),
    ...(item.altText ? { alt_text: String(item.altText).slice(0, 1000) } : {}),
  };
}

export async function publishInstagram({ auth, format, caption, media, firstComment, resume, deadline }) {
  if (!auth.token || !auth.nodeId) return { status: "failed", error: "The Instagram account has no access token — reconnect it in Social Accounts." };
  const state = { ...(resume || {}) };

  if (!state.mediaId) {
    if (format === "carousel") {
      if (!state.childIds) {
        const childIds = [];
        for (const item of media.slice(0, 10)) {
          const res = await igCreate(auth, igMediaBody(item, { carouselItem: true }));
          if (!res.ok) return fail(res, "Carousel item: ");
          childIds.push(res.data.id);
        }
        state.childIds = childIds;
      }
      if (!state.containerId) {
        const wait = await igWaitFor(state.childIds, auth, deadline);
        if (wait.error) return { status: "failed", error: wait.error };
        if (wait.pending) return { status: "pending", resume: state };
        const res = await igCreate(auth, { media_type: "CAROUSEL", children: state.childIds.join(","), caption });
        if (!res.ok) return fail(res);
        state.containerId = res.data.id;
      }
    } else if (!state.containerId) {
      const item = media[0];
      if (!item) return { status: "failed", error: "Instagram posts need an image or video." };
      const body = igMediaBody(item, { format });
      if (format !== "story") body.caption = caption;
      const res = await igCreate(auth, body);
      if (!res.ok) return fail(res);
      state.containerId = res.data.id;
    }

    const ready = await igWaitFor([state.containerId], auth, deadline);
    if (ready.error) return { status: "failed", error: ready.error };
    if (ready.pending) return { status: "pending", resume: state };

    const published = await graphRequest(`${auth.nodeId}/media_publish`, {
      token: auth.token,
      host: auth.host,
      method: "POST",
      body: { creation_id: state.containerId },
    });
    if (!published.ok) return fail(published);
    state.mediaId = published.data.id;
  }

  const info = await graphRequest(state.mediaId, { token: auth.token, host: auth.host, query: { fields: "permalink,timestamp" } });
  const meta = {};
  if (firstComment && format !== "story") {
    const comment = await graphRequest(`${state.mediaId}/comments`, { token: auth.token, host: auth.host, method: "POST", body: { message: firstComment } });
    meta.firstComment = comment.ok ? { status: "posted", id: comment.data?.id } : { status: "failed", error: comment.error };
  }
  return { status: "published", externalId: state.mediaId, permalink: info.ok ? info.data?.permalink || "" : "", meta };
}

// Facebook Page --------------------------------------------------------------

const firstUrl = (text) => String(text || "").match(/https?:\/\/\S+/)?.[0] || null;

export async function publishFacebook({ auth, caption, media, firstComment }) {
  if (!auth.token || !auth.nodeId) return { status: "failed", error: "The Facebook Page has no access token — reconnect it in Social Accounts." };
  const call = (path, body) => graphRequest(path, { token: auth.token, method: "POST", body });
  let postId = null;
  let permalinkPath = null;

  const videos = media.filter((m) => m.kind === "video");
  if (videos.length) {
    const res = await call(`${auth.nodeId}/videos`, { file_url: videos[0].url, description: caption });
    if (!res.ok) return fail(res);
    postId = res.data.id;
  } else if (media.length === 1) {
    const res = await call(`${auth.nodeId}/photos`, {
      url: media[0].url,
      caption,
      ...(media[0].altText ? { alt_text_custom: media[0].altText } : {}),
    });
    if (!res.ok) return fail(res);
    postId = res.data.post_id || res.data.id;
  } else if (media.length > 1) {
    const attached = [];
    for (const item of media.slice(0, 10)) {
      const res = await call(`${auth.nodeId}/photos`, {
        url: item.url,
        published: false,
        ...(item.altText ? { alt_text_custom: item.altText } : {}),
      });
      if (!res.ok) return fail(res, "Photo upload: ");
      attached.push({ media_fbid: res.data.id });
    }
    const res = await call(`${auth.nodeId}/feed`, { message: caption, attached_media: attached });
    if (!res.ok) return fail(res);
    postId = res.data.id;
  } else {
    const link = firstUrl(caption);
    const res = await call(`${auth.nodeId}/feed`, { message: caption, ...(link ? { link } : {}) });
    if (!res.ok) return fail(res);
    postId = res.data.id;
  }

  const info = await graphRequest(postId, { token: auth.token, query: { fields: "permalink_url" } });
  if (info.ok) permalinkPath = info.data?.permalink_url || null;
  const permalink = permalinkPath ? (permalinkPath.startsWith("http") ? permalinkPath : `https://www.facebook.com${permalinkPath}`) : "";

  const meta = {};
  if (firstComment) {
    const comment = await call(`${postId}/comments`, { message: firstComment });
    meta.firstComment = comment.ok ? { status: "posted", id: comment.data?.id } : { status: "failed", error: comment.error };
  }
  return { status: "published", externalId: postId, permalink, meta };
}

// Telegram channel -----------------------------------------------------------

const tgFail = (res) => ({ status: "failed", error: String(res?.error || "Telegram request failed").slice(0, 500), transient: res?.error === "request_failed" });

export async function publishTelegram({ auth, caption, media }) {
  if (!auth.token) return { status: "failed", error: "The Telegram bot has no token — reconnect it in Social Accounts." };
  if (!auth.chatId) return { status: "failed", error: "Set the Telegram channel (e.g. @yourchannel) this bot posts to." };
  let res;
  if (!media.length) {
    res = await telegramRequest(auth.token, "sendMessage", { chat_id: auth.chatId, text: caption });
  } else if (media.length === 1) {
    const item = media[0];
    res = item.kind === "video"
      ? await telegramRequest(auth.token, "sendVideo", { chat_id: auth.chatId, video: item.url, caption })
      : await telegramRequest(auth.token, "sendPhoto", { chat_id: auth.chatId, photo: item.url, caption });
  } else {
    res = await telegramRequest(auth.token, "sendMediaGroup", {
      chat_id: auth.chatId,
      media: media.slice(0, 10).map((item, i) => ({
        type: item.kind === "video" ? "video" : "photo",
        media: item.url,
        ...(i === 0 && caption ? { caption } : {}),
      })),
    });
  }
  if (!res.ok) return tgFail(res);
  const message = Array.isArray(res.data) ? res.data[0] : res.data;
  const username = message?.chat?.username;
  return {
    status: "published",
    externalId: String(message?.message_id ?? ""),
    permalink: username ? `https://t.me/${username}/${message.message_id}` : "",
    meta: { chatId: message?.chat?.id ?? auth.chatId },
  };
}
