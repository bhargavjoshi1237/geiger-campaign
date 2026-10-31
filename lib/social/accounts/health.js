import { randomBytes } from "node:crypto";
import { graphRequest } from "@/lib/social/meta_graph";
import { telegramRequest } from "@/lib/social/telegram";
import { saveConnectionSecrets } from "@/lib/messaging/connections";
import { publicUrl } from "@/lib/server/urls";
import {
  appSubscriptions,
  debugToken,
  isMetaConfigured,
  metaWebhookUrl,
  pageSubscription,
} from "@/lib/social/oauth/meta";
import {
  isTikTokConfigured,
  refreshTikTokToken,
  tiktokBusinessInfo,
  tiktokWebhookInfo,
  tiktokWebhookUrl,
} from "@/lib/social/oauth/tiktok";
import { googleAccessToken, googleRequest } from "@/lib/social/oauth/google";
import {
  BUSINESS_COMMUNICATIONS_SCOPE,
  INSTAGRAM_WEBHOOK_FIELDS,
  META_SCOPES,
  PAGE_WEBHOOK_FIELDS,
  RBM_SCOPE,
  TELEGRAM_ALLOWED_UPDATES,
  tiktokRegionRestricted,
} from "./catalog";
import { saveHealth } from "./store";

// Token health for social connections (server-only): validity, expiry, granted vs required permissions, webhook
// subscription state and the profile/limit numbers each platform exposes. Persists the result on the connection
// (health + status + last_checked_at); `reauthRequired` + `issues` drive the re-auth alerts in the UI.

const DAY = 86_400_000;
const soon = (iso, days) => Boolean(iso) && new Date(iso).getTime() - Date.now() < days * DAY;
const issue = (level, message, action = null) => ({ level, message, action });

export function telegramWebhookUrl(connectionId) {
  return publicUrl(`/api/webhooks/telegram/${connectionId}`);
}

export async function setTelegramWebhook(token, connectionId, secret) {
  return telegramRequest(token, "setWebhook", {
    url: telegramWebhookUrl(connectionId),
    secret_token: secret,
    allowed_updates: TELEGRAM_ALLOWED_UPDATES,
  });
}

async function metaHealth(connection, secrets) {
  const channel = connection.channel;
  const issues = [];
  if (!isMetaConfigured()) {
    return { status: connection.status, health: { issues: [issue("error", "META_APP_ID and META_APP_SECRET aren't set on the server.")] } };
  }
  const token = secrets?.pageAccessToken;
  if (!token) {
    return {
      status: "error",
      health: { tokenValid: false, reauthRequired: true, issues: [issue("error", "No Page access token is stored. Reconnect the account.", "reconnect")] },
    };
  }

  const dbg = await debugToken(token);
  const tokenValid = dbg.ok && dbg.isValid;
  const scopes = dbg.ok ? dbg.scopes : [];
  const missingScopes = dbg.ok ? (META_SCOPES[channel]?.required || []).filter((s) => !scopes.includes(s)) : [];
  if (!tokenValid) issues.push(issue("error", dbg.error || "Meta reports the Page token is no longer valid.", "reconnect"));
  if (missingScopes.length) issues.push(issue("error", `Missing permissions: ${missingScopes.join(", ")}.`, "reconnect"));
  if (tokenValid && soon(dbg.dataAccessExpiresAt, 7)) issues.push(issue("warning", "Meta data access expires within 7 days. Reconnect to renew it.", "reconnect"));

  const pageId = connection.config?.pageId || connection.external_id;
  const webhook = { url: metaWebhookUrl(), subscribed: false, fields: [], missingFields: [] };
  if (tokenValid) {
    const sub = await pageSubscription(pageId, token);
    webhook.fields = sub.fields || [];
    webhook.subscribed = Boolean(sub.fields);
    webhook.missingFields = PAGE_WEBHOOK_FIELDS.filter((f) => !webhook.fields.includes(f));
    if (!sub.ok) webhook.lastError = sub.error;
    const app = await appSubscriptions();
    const object = app.objects?.[channel === "instagram" ? "instagram" : "page"];
    webhook.appSubscribed = Boolean(object?.active && object.callbackUrl === metaWebhookUrl());
    if (channel === "instagram" && object) webhook.missingFields = INSTAGRAM_WEBHOOK_FIELDS.filter((f) => !object.fields.includes(f));
    if (!webhook.subscribed) issues.push(issue("error", "The Page isn't subscribed to this app's webhooks, so new messages won't arrive.", "reconnect"));
    else if (app.ok && !webhook.appSubscribed) issues.push(issue("warning", `The app's ${channel === "instagram" ? "Instagram" : "Page"} webhook isn't pointed at ${metaWebhookUrl()}.`));
  }

  let profile = {};
  if (tokenValid) {
    const res =
      channel === "instagram"
        ? await graphRequest(connection.external_id, { token, query: { fields: "username,name,profile_picture_url,followers_count,media_count" } })
        : await graphRequest(pageId, { token, query: { fields: "name,username,followers_count,fan_count,picture{url}" } });
    if (res.ok) {
      profile = {
        name: res.data.name || "",
        username: res.data.username || "",
        pictureUrl: res.data.profile_picture_url || res.data.picture?.data?.url || "",
        followers: res.data.followers_count ?? res.data.fan_count ?? null,
        mediaCount: res.data.media_count ?? null,
      };
    }
  }

  const reauthRequired = !tokenValid || missingScopes.length > 0 || soon(dbg.dataAccessExpiresAt, 7);
  return {
    status: tokenValid ? "connected" : "error",
    health: {
      tokenValid,
      tokenType: dbg.type || "PAGE",
      tokenExpiresAt: dbg.expiresAt || null,
      dataAccessExpiresAt: dbg.dataAccessExpiresAt || null,
      userTokenExpiresAt: secrets.userTokenExpiresAt || null,
      scopes,
      missingScopes,
      webhook,
      profile,
      reauthRequired,
      issues,
      lastError: tokenValid ? null : dbg.error || "Token invalid",
    },
  };
}

async function telegramHealth(db, connection, secrets) {
  const token = secrets?.botToken;
  if (!token) {
    return { status: "error", health: { tokenValid: false, reauthRequired: true, issues: [issue("error", "No bot token is stored. Add the bot again.", "reconnect")] } };
  }
  const issues = [];
  const me = await telegramRequest(token, "getMe");
  if (!me.ok) {
    const revoked = /unauthorized/i.test(me.error || "");
    return {
      status: "error",
      health: {
        tokenValid: false,
        reauthRequired: revoked,
        issues: [issue("error", revoked ? "Telegram rejected the bot token — it was revoked or regenerated in @BotFather." : me.error, revoked ? "reconnect" : null)],
        lastError: me.error,
      },
    };
  }

  const expected = telegramWebhookUrl(connection.id);
  let info = await telegramRequest(token, "getWebhookInfo");
  let repaired = false;
  if (info.ok && info.data?.url !== expected) {
    let secret = secrets.webhookSecret;
    if (!secret) {
      secret = randomBytes(24).toString("hex");
      await saveConnectionSecrets(db, { projectId: connection.project_id, connectionId: connection.id, secrets: { webhookSecret: secret } });
    }
    const set = await setTelegramWebhook(token, connection.id, secret);
    repaired = set.ok;
    if (!set.ok) issues.push(issue("error", `Couldn't register the webhook: ${set.error}. Telegram needs a public HTTPS URL.`));
    info = await telegramRequest(token, "getWebhookInfo");
  }
  const w = info.data || {};
  const lastErrorAt = w.last_error_date ? new Date(w.last_error_date * 1000).toISOString() : null;
  if (lastErrorAt && Date.now() - new Date(lastErrorAt).getTime() < DAY) issues.push(issue("warning", `Telegram couldn't deliver an update: ${w.last_error_message}.`));
  if (Number(w.pending_update_count) > 100) issues.push(issue("warning", `${w.pending_update_count} updates are waiting to be delivered.`));

  return {
    status: w.url === expected ? "connected" : "error",
    health: {
      tokenValid: true,
      tokenExpiresAt: null,
      bot: {
        id: me.data.id,
        username: me.data.username,
        canJoinGroups: Boolean(me.data.can_join_groups),
        canReadAllGroupMessages: Boolean(me.data.can_read_all_group_messages),
      },
      webhook: {
        url: w.url || "",
        subscribed: w.url === expected,
        fields: w.allowed_updates || TELEGRAM_ALLOWED_UPDATES,
        pendingUpdates: Number(w.pending_update_count) || 0,
        lastErrorAt,
        lastError: w.last_error_message || null,
        repaired,
      },
      reauthRequired: false,
      issues,
      lastError: null,
    },
  };
}

async function tiktokHealth(db, connection, secrets) {
  const issues = [];
  if (!isTikTokConfigured()) return { status: connection.status, health: { issues: [issue("error", "TIKTOK_APP_ID and TIKTOK_APP_SECRET aren't set on the server.")] } };
  let { accessToken, refreshToken, expiresAt, refreshExpiresAt } = secrets || {};
  if (!accessToken) return { status: "error", health: { tokenValid: false, reauthRequired: true, issues: [issue("error", "No TikTok token is stored. Reconnect the account.", "reconnect")] } };

  if (soon(expiresAt, 1 / 24) && refreshToken && !soon(refreshExpiresAt, 0)) {
    const refreshed = await refreshTikTokToken(refreshToken);
    if (refreshed.ok) {
      ({ accessToken, refreshToken, expiresAt, refreshExpiresAt } = refreshed);
      await saveConnectionSecrets(db, { projectId: connection.project_id, connectionId: connection.id, secrets: { accessToken, refreshToken, expiresAt, refreshExpiresAt } });
    } else {
      issues.push(issue("error", `TikTok refused the refresh token: ${refreshed.error}.`, "reconnect"));
    }
  }

  const info = await tiktokBusinessInfo(connection.external_id, accessToken);
  const tokenValid = info.ok;
  if (!tokenValid) issues.push(issue("error", info.error || "TikTok rejected the access token.", "reconnect"));
  if (soon(refreshExpiresAt, 7)) issues.push(issue("warning", "TikTok's refresh token expires within 7 days. Reconnect to renew it.", "reconnect"));

  const region = connection.config?.region || null;
  const restricted = tiktokRegionRestricted(region);
  if (restricted) issues.push(issue("error", "TikTok doesn't offer business messaging in the EEA, Switzerland or the UK. Sends are blocked for this account."));

  const hook = await tiktokWebhookInfo();
  const webhook = { url: tiktokWebhookUrl(), subscribed: hook.ok && hook.callbackUrl === tiktokWebhookUrl(), registeredUrl: hook.callbackUrl, lastError: hook.error };
  if (hook.ok && !webhook.subscribed) issues.push(issue("warning", "TikTok's DIRECT_MESSAGE webhook points somewhere else, so new messages won't arrive here."));

  return {
    status: tokenValid ? "connected" : "error",
    health: {
      tokenValid,
      tokenExpiresAt: expiresAt || null,
      refreshExpiresAt: refreshExpiresAt || null,
      scopes: secrets.scopes || [],
      missingScopes: [],
      messagingAvailable: !restricted,
      region,
      webhook,
      profile: info.ok ? { username: info.username, name: info.displayName, pictureUrl: info.profileImage, followers: info.followers } : {},
      reauthRequired: !tokenValid || soon(refreshExpiresAt, 7),
      issues,
      lastError: tokenValid ? null : info.error,
    },
  };
}

// Launch state per region from the Business Communications API (only when the brand id is known).
async function rcsLaunchState(secrets, config) {
  if (!config?.brandId || !config?.agentId) return null;
  const auth = await googleAccessToken(secrets.serviceAccount, [BUSINESS_COMMUNICATIONS_SCOPE]);
  if (!auth.ok) return { error: auth.error };
  const agent = String(config.agentId).replace(/@.*$/, "");
  const res = await googleRequest(`https://businesscommunications.googleapis.com/v1/brands/${config.brandId}/agents/${agent}/launch`, { token: auth.token });
  if (!res.ok) return { error: res.error };
  const details = res.data?.rcsBusinessMessaging?.launchDetails || {};
  const states = Object.values(details).map((d) => d?.launchState).filter(Boolean);
  return {
    states,
    launched: states.includes("LAUNCH_STATE_LAUNCHED"),
    regions: Object.entries(details).map(([region, d]) => ({ region, state: d?.launchState || "LAUNCH_STATE_UNSPECIFIED" })),
  };
}

async function rcsHealth(connection, secrets) {
  const issues = [];
  if (!secrets?.serviceAccount) {
    return { status: "error", health: { tokenValid: false, reauthRequired: true, issues: [issue("error", "No service account key is stored. Add the agent again.", "reconnect")] } };
  }
  const auth = await googleAccessToken(secrets.serviceAccount, [RBM_SCOPE]);
  if (!auth.ok) issues.push(issue("error", `Google rejected the service account: ${auth.error}.`, "reconnect"));
  const launch = auth.ok ? await rcsLaunchState(secrets, connection.config) : null;
  if (launch && !launch.error && !launch.launched) issues.push(issue("warning", "The agent isn't launched yet — only registered test devices receive messages."));
  if (launch?.error) issues.push(issue("warning", `Couldn't read the launch state: ${launch.error}.`));
  if (!secrets.webhookClientToken) issues.push(issue("warning", "No webhook client token is set, so replies and delivery receipts won't be verified."));
  return {
    status: auth.ok ? (launch && !launch.error && !launch.launched ? "pending" : "connected") : "error",
    health: {
      tokenValid: auth.ok,
      tokenExpiresAt: null,
      serviceAccount: secrets.serviceAccount?.client_email || null,
      launch: launch && !launch.error ? launch : null,
      webhook: {
        url: publicUrl(`/api/webhooks/rcs/${connection.id}`),
        subscribed: Boolean(secrets.webhookClientToken),
        lastEventAt: connection.health?.webhook?.lastEventAt || null,
      },
      reauthRequired: !auth.ok,
      issues,
      lastError: auth.ok ? null : auth.error,
    },
  };
}

// Runs the channel's check, persists it, and returns the updated raw row (or null on a write failure).
export async function checkConnectionHealth(db, connection, secrets) {
  let result;
  try {
    if (connection.channel === "instagram" || connection.channel === "messenger") result = await metaHealth(connection, secrets);
    else if (connection.channel === "telegram") result = await telegramHealth(db, connection, secrets);
    else if (connection.channel === "tiktok") result = await tiktokHealth(db, connection, secrets);
    else if (connection.channel === "rcs") result = await rcsHealth(connection, secrets);
    else return connection;
  } catch (error) {
    console.error("[social.health]", connection.channel, error);
    result = { status: connection.status, health: { issues: [issue("error", "The health check failed unexpectedly.")] } };
  }
  const prev = connection.health && typeof connection.health === "object" ? connection.health : {};
  const health = { ...prev, ...result.health, checkedAt: new Date().toISOString() };
  return saveHealth(db, connection.id, { status: result.status, health });
}
