import { randomBytes } from "node:crypto";
import { telegramRequest } from "@/lib/social/telegram";
import { badRequest, notConfigured } from "@/lib/server/http";
import {
  debugToken,
  ensureAppSubscriptions,
  exchangeMetaCode,
  isMetaConfigured,
  listManagedPages,
  longLivedUserToken,
  metaAuthorizeUrl,
  subscribePage,
} from "@/lib/social/oauth/meta";
import {
  exchangeTikTokCode,
  isTikTokConfigured,
  registerTikTokWebhook,
  tiktokAuthorizeUrl,
  tiktokBusinessInfo,
} from "@/lib/social/oauth/tiktok";
import { googleAccessToken, parseServiceAccount } from "@/lib/social/oauth/google";
import { createOAuthState, isSigningConfigured } from "@/lib/social/oauth/state";
import { RBM_SCOPE, tiktokRegionRestricted } from "./catalog";
import { checkConnectionHealth, setTelegramWebhook } from "./health";
import { upsertSocialConnection } from "./store";

// Social connect flows (server-only; routes authorize campaign.channel.manage first, then pass the service-role
// db): Meta (Facebook Login for Business -> Pages + linked Instagram accounts), Telegram bot tokens, TikTok
// business authorization and Google RBM agents. Every flow ends with a health check so the screen shows real state.

const text = (value, max = 200) => String(value ?? "").trim().slice(0, max);

function requireSigning() {
  if (!isSigningConfigured()) throw notConfigured("CAMPAIGN_SIGNING_SECRET isn't set, so OAuth state can't be signed.");
}

export function startMetaConnect({ projectId, userId, channels, tab }) {
  if (!isMetaConfigured()) throw notConfigured("Connecting Meta accounts needs META_APP_ID and META_APP_SECRET on the server.");
  requireSigning();
  const wanted = (channels || []).filter((c) => c === "instagram" || c === "messenger");
  if (!wanted.length) throw badRequest("Choose Instagram, Messenger or both.");
  const state = createOAuthState({ provider: "meta", projectId, userId, channels: wanted, tab });
  return { url: metaAuthorizeUrl({ state, channels: wanted }) };
}

// Exchanges the code, connects every granted Page (Messenger) and linked Instagram account, subscribes webhooks.
export async function completeMetaConnect(db, { projectId, userId, channels }, code) {
  const exchange = await exchangeMetaCode(code);
  if (!exchange.ok) return { connected: 0, skipped: [], error: exchange.error };
  const long = await longLivedUserToken(exchange.token);
  const userToken = long.ok ? long.token : exchange.token;
  const userTokenExpiresAt = long.ok ? long.expiresAt : null;
  const user = await debugToken(userToken);
  const grantedScopes = user.ok ? user.scopes : [];

  const { ok, pages, error } = await listManagedPages(userToken);
  if (!ok) return { connected: 0, skipped: [], error };
  if (!pages.length) return { connected: 0, skipped: [], error: "No Facebook Pages were shared. Choose at least one Page in the Facebook dialog." };

  const connected = [];
  const skipped = [];
  for (const page of pages) {
    if (!page.access_token) {
      skipped.push(`${page.name}: you need a task on this Page to connect it.`);
      continue;
    }
    const secrets = { pageAccessToken: page.access_token, userAccessToken: userToken, userTokenExpiresAt, grantedScopes };
    const pageConfig = { pageId: page.id, pageName: page.name, category: page.category || null, tasks: page.tasks || [], brand: page.name };
    let pageUsed = false;

    if (channels.includes("messenger")) {
      const res = await upsertSocialConnection(db, {
        projectId,
        userId,
        channel: "messenger",
        provider: "meta_graph",
        externalId: page.id,
        name: page.name,
        handle: page.username ? `@${page.username}` : page.name,
        config: pageConfig,
        secrets,
      });
      if (res.ok) {
        connected.push({ row: res.connection, secrets });
        pageUsed = true;
      } else skipped.push(res.error);
    }

    if (channels.includes("instagram")) {
      const ig = page.instagram_business_account;
      if (!ig) skipped.push(`${page.name} has no Instagram professional account linked.`);
      else {
        const res = await upsertSocialConnection(db, {
          projectId,
          userId,
          channel: "instagram",
          provider: "meta_graph",
          externalId: ig.id,
          name: ig.name || ig.username,
          handle: ig.username ? `@${ig.username}` : "",
          config: { ...pageConfig, igUserId: ig.id, username: ig.username || "" },
          secrets,
        });
        if (res.ok) {
          connected.push({ row: res.connection, secrets });
          pageUsed = true;
        } else skipped.push(res.error);
      }
    }

    // Instagram and Messenger webhooks both arrive only for Pages subscribed to the app.
    if (pageUsed) {
      const sub = await subscribePage(page.id, page.access_token, { leads: grantedScopes.includes("leads_retrieval") });
      if (!sub.ok) skipped.push(`${page.name}: couldn't subscribe to webhooks (${sub.error}).`);
    }
  }

  if (connected.length) await ensureAppSubscriptions();
  for (const { row, secrets } of connected) await checkConnectionHealth(db, row, secrets);
  return { connected: connected.length, skipped, error: connected.length ? null : skipped[0] || "Nothing was connected." };
}

export async function connectTelegramBot(db, { projectId, userId, token, brand }) {
  const botToken = text(token, 100);
  if (!/^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(botToken)) throw badRequest("That isn't a bot token from @BotFather (it looks like 123456789:AA…).");
  const me = await telegramRequest(botToken, "getMe");
  if (!me.ok) throw badRequest(`Telegram rejected the token: ${me.error}.`);
  if (!me.data?.is_bot) throw badRequest("That token doesn't belong to a bot.");

  const webhookSecret = randomBytes(24).toString("hex");
  const res = await upsertSocialConnection(db, {
    projectId,
    userId,
    channel: "telegram",
    provider: "telegram_bot",
    externalId: me.data.id,
    name: me.data.first_name || me.data.username,
    handle: `@${me.data.username}`,
    config: { botId: me.data.id, username: me.data.username, brand: text(brand, 80) || me.data.first_name },
    status: "pending",
    secrets: { botToken, webhookSecret },
  });
  if (!res.ok) throw badRequest(res.error);
  await setTelegramWebhook(botToken, res.connection.id, webhookSecret);
  return checkConnectionHealth(db, res.connection, { botToken, webhookSecret });
}

export function startTikTokConnect({ projectId, userId, region, tab }) {
  if (!isTikTokConfigured()) throw notConfigured("Connecting TikTok needs TIKTOK_APP_ID and TIKTOK_APP_SECRET on the server.");
  requireSigning();
  const country = text(region, 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw badRequest("Choose the country the TikTok business account is registered in.");
  if (tiktokRegionRestricted(country)) {
    throw badRequest("TikTok doesn't offer business messaging to accounts in the EEA, Switzerland or the UK.");
  }
  const state = createOAuthState({ provider: "tiktok", projectId, userId, channels: ["tiktok"], tab, extra: { region: country } });
  return { url: tiktokAuthorizeUrl({ state }) };
}

export async function completeTikTokConnect(db, { projectId, userId, extra }, code) {
  const tok = await exchangeTikTokCode(code);
  if (!tok.ok) return { connected: 0, skipped: [], error: tok.error };
  const info = await tiktokBusinessInfo(tok.businessId, tok.accessToken);
  const res = await upsertSocialConnection(db, {
    projectId,
    userId,
    channel: "tiktok",
    provider: "tiktok",
    externalId: tok.businessId,
    name: info.ok ? info.displayName || info.username : "TikTok business account",
    handle: info.ok && info.username ? `@${info.username}` : "",
    config: { region: extra?.region || null, username: info.ok ? info.username : "", brand: info.ok ? info.displayName || info.username : "TikTok" },
    secrets: { accessToken: tok.accessToken, refreshToken: tok.refreshToken, expiresAt: tok.expiresAt, refreshExpiresAt: tok.refreshExpiresAt, scopes: tok.scopes },
  });
  if (!res.ok) return { connected: 0, skipped: [], error: res.error };
  await registerTikTokWebhook();
  await checkConnectionHealth(db, res.connection, { accessToken: tok.accessToken, refreshToken: tok.refreshToken, expiresAt: tok.expiresAt, refreshExpiresAt: tok.refreshExpiresAt, scopes: tok.scopes });
  return { connected: 1, skipped: [], error: null };
}

export async function connectRcsAgent(db, { projectId, userId, input }) {
  const agentId = text(input?.agentId, 200);
  if (!agentId) throw badRequest("Enter the RBM agent id from the Business Communications console.");
  const serviceAccount = parseServiceAccount(input?.serviceAccount);
  if (!serviceAccount) throw badRequest("Paste the agent's service account key (JSON with client_email and private_key).");
  const auth = await googleAccessToken(serviceAccount, [RBM_SCOPE]);
  if (!auth.ok) throw badRequest(`Google rejected the service account: ${auth.error}.`);

  const rates = {
    basic: Math.max(0, Number(input?.rates?.basic) || 0),
    rich: Math.max(0, Number(input?.rates?.rich) || 0),
    currency: text(input?.rates?.currency, 3).toUpperCase() || "USD",
  };
  const res = await upsertSocialConnection(db, {
    projectId,
    userId,
    channel: "rcs",
    provider: "google_rcs",
    externalId: agentId,
    name: text(input?.displayName, 100) || agentId,
    handle: agentId,
    config: {
      agentId,
      brandId: text(input?.brandId, 100) || null,
      region: ["europe", "asia"].includes(input?.region) ? input.region : "global",
      rates,
      brand: text(input?.brand, 80) || text(input?.displayName, 100) || agentId,
    },
    status: "pending",
    secrets: { serviceAccount, ...(input?.webhookClientToken ? { webhookClientToken: text(input.webhookClientToken, 200) } : {}) },
  });
  if (!res.ok) throw badRequest(res.error);
  return checkConnectionHealth(db, res.connection, { serviceAccount, webhookClientToken: input?.webhookClientToken || null });
}
