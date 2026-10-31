import { randomBytes } from "node:crypto";
import { isSigningConfigured, signToken, verifyToken } from "@/lib/server/tokens";

// OAuth `state` for the social connect flows: a short-lived signed token (CAMPAIGN_SIGNING_SECRET) carrying the
// project, the user who started the flow, the requested channels and the screen to return to. Stateless, so
// the callback needs no table; a random nonce keeps every state unique.

const KIND = "social_oauth";
const TTL_DAYS = 30 / (24 * 60); // 30 minutes

export { isSigningConfigured };

export function createOAuthState({ provider, projectId, userId, channels = [], tab = null, extra = {} }) {
  return signToken(
    { k: KIND, p: provider, pid: projectId, uid: userId, ch: channels, tab, n: randomBytes(8).toString("hex"), x: extra },
    { ttlDays: TTL_DAYS },
  );
}

// { provider, projectId, userId, channels, tab, extra } or null when forged, expired or for another provider.
export function readOAuthState(token, provider) {
  const payload = verifyToken(token, KIND);
  if (!payload || payload.p !== provider) return null;
  return {
    provider: payload.p,
    projectId: payload.pid,
    userId: payload.uid,
    channels: Array.isArray(payload.ch) ? payload.ch : [],
    tab: payload.tab || null,
    extra: payload.x && typeof payload.x === "object" ? payload.x : {},
  };
}
