import { randomBytes } from "node:crypto";
import { loadConnection, saveConnectionSecrets } from "@/lib/messaging/connections";
import { dispatch } from "@/lib/messaging/dispatch";
import { isEmailConfigured } from "@/lib/email/client";
import { ApiError, badRequest, notFound } from "@/lib/server/http";
import { publicUrl } from "@/lib/server/urls";
import * as twilio from "./twilio";
import * as wa from "./whatsapp_cloud";
import { generateVapidKeys, isValidVapidPair } from "./web_push";
import { sampleVariables } from "./whatsapp_templates";

// Channel connection lifecycle (server-only, service-role db; routes authorize campaign.channel.manage
// first): connect = validate + live-verify credentials against the provider, then write the connection
// row and its channel_secrets; verify = re-check health; test = one real send through dispatch.

export const CHANNEL_PROVIDER = {
  email: "geiger_email",
  sms: "twilio",
  whatsapp: "meta_cloud",
  push: "web_push",
  in_app: "geiger_sdk",
};

export const twilioInboundUrl = () => publicUrl("/api/webhooks/twilio/inbound");
export const twilioStatusUrl = () => publicUrl("/api/webhooks/twilio/status");

const emailApiHost = () => {
  try {
    return new URL(process.env.GEIGER_EMAIL_API_URL || "https://geiger.studio").host;
  } catch {
    return "geiger.studio";
  }
};

const trimmed = (v) => String(v ?? "").trim();

// Only the credential fields each provider takes; anything else in the body is ignored.
function readCredentials(channel, input = {}, existing = {}) {
  if (channel === "sms") {
    const accountSid = trimmed(input.accountSid) || existing.accountSid;
    const authToken = trimmed(input.authToken) || existing.authToken;
    if (!/^AC[0-9a-f]{32}$/i.test(accountSid || "")) throw badRequest("Enter your Twilio Account SID (starts with AC).");
    if (!authToken || authToken.length < 16) throw badRequest("Enter your Twilio Auth Token.");
    return { accountSid, authToken };
  }
  if (channel === "whatsapp") {
    const accessToken = trimmed(input.accessToken) || existing.accessToken;
    const phoneNumberId = trimmed(input.phoneNumberId) || existing.phoneNumberId;
    const wabaId = trimmed(input.wabaId) || existing.wabaId;
    if (!accessToken) throw badRequest("Enter a system user access token with whatsapp_business_messaging access.");
    if (!/^\d+$/.test(phoneNumberId || "")) throw badRequest("Enter the phone number ID from WhatsApp Manager.");
    if (!/^\d+$/.test(wabaId || "")) throw badRequest("Enter the WhatsApp Business Account ID.");
    const appSecret = trimmed(input.appSecret) || existing.appSecret || undefined;
    return { accessToken, phoneNumberId, wabaId, ...(appSecret ? { appSecret } : {}) };
  }
  return { ...existing };
}

// Live check against the provider -> the connection columns to write, or { ok: false, error }.
async function probe(channel, secrets, existing, input = {}) {
  const now = new Date().toISOString();

  if (channel === "email") {
    const configured = isEmailConfigured();
    return {
      ok: true,
      patch: {
        name: "Geiger Dash",
        display_handle: emailApiHost(),
        status: configured ? "connected" : "error",
        config: { ...(existing?.config || {}), apiHost: emailApiHost() },
        health: { configured, lastError: configured ? null : "GEIGER_EMAIL_API_KEY isn't set on this deployment.", checkedAt: now },
      },
    };
  }

  if (channel === "sms") {
    const account = await twilio.getAccount(secrets);
    if (!account.ok) return { ok: false, error: account.error.message };
    const numbers = await twilio.listNumbers(secrets);
    const inboundUrl = twilioInboundUrl();
    const active = account.data?.status === "active";
    const list = numbers.ok
      ? numbers.data.map((n) => ({ ...n, inbound: n.smsUrl === inboundUrl }))
      : existing?.config?.numbers || [];
    return {
      ok: true,
      patch: {
        name: account.data?.friendly_name || "Twilio",
        external_id: secrets.accountSid,
        display_handle: account.data?.friendly_name || secrets.accountSid,
        status: active ? "connected" : "error",
        config: { ...(existing?.config || {}), accountType: account.data?.type || "", numbers: list },
        health: {
          accountStatus: account.data?.status || "",
          accountType: account.data?.type || "",
          numbers: list.length,
          lastError: active ? (numbers.ok ? null : numbers.error.message) : `The Twilio account is ${account.data?.status}.`,
          checkedAt: now,
        },
      },
    };
  }

  if (channel === "whatsapp") {
    const [phone, waba] = await Promise.all([
      wa.getPhoneNumber(secrets.accessToken, secrets.phoneNumberId),
      wa.getBusinessAccount(secrets.accessToken, secrets.wabaId),
    ]);
    if (!phone.ok) return { ok: false, error: `Phone number: ${phone.error.message}` };
    if (!waba.ok) return { ok: false, error: `Business account: ${waba.error.message}` };
    const quality = String(phone.data?.quality_rating || "UNKNOWN").toUpperCase();
    return {
      ok: true,
      patch: {
        name: phone.data?.verified_name || "WhatsApp",
        external_id: secrets.phoneNumberId,
        display_handle: phone.data?.display_phone_number || "",
        status: "connected",
        config: {
          ...(existing?.config || {}),
          wabaId: secrets.wabaId,
          wabaName: waba.data?.name || "",
          verifiedName: phone.data?.verified_name || "",
          displayPhoneNumber: phone.data?.display_phone_number || "",
        },
        health: {
          qualityRating: quality,
          messagingLimitTier: phone.data?.messaging_limit_tier || null,
          lastError: quality === "RED" ? "Quality rating is low — Meta may lower your messaging limit." : null,
          checkedAt: now,
        },
      },
    };
  }

  if (channel === "push") {
    const publicKey = existing?.config?.vapidPublicKey;
    const valid = isValidVapidPair(publicKey, secrets.vapidPrivateKey);
    const subject = trimmed(input.subject) || existing?.config?.subject || "";
    return {
      ok: true,
      patch: {
        name: "Web push",
        display_handle: subject,
        status: valid ? "connected" : "error",
        config: { ...(existing?.config || {}), vapidPublicKey: publicKey, subject },
        health: { lastError: valid ? null : "The stored VAPID key pair is invalid — reconnect web push.", checkedAt: now },
      },
    };
  }

  if (channel === "in_app") {
    const ok = Boolean(secrets.identitySecret);
    return {
      ok: true,
      patch: {
        name: "In-app SDK",
        display_handle: "",
        status: ok ? "connected" : "error",
        config: { ...(existing?.config || {}), requireIdentity: true },
        health: { lastError: ok ? null : "The identity secret is missing — rotate it.", checkedAt: now },
      },
    };
  }

  return { ok: false, error: `Unsupported channel "${channel}".` };
}

const newIdentitySecret = () => randomBytes(24).toString("base64url");

async function readSecrets(db, connectionId) {
  if (!connectionId) return {};
  const { data } = await db.from("channel_secrets").select("secrets").eq("connection_id", connectionId).maybeSingle();
  return data?.secrets || {};
}

export async function findChannelConnection(db, projectId, channel) {
  const { data } = await db
    .from("channel_connections")
    .select("*")
    .eq("project_id", projectId)
    .eq("channel", channel)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data || null;
}

export async function getProjectConnection(db, projectId, connectionId) {
  const { data } = await db
    .from("channel_connections")
    .select("*")
    .eq("project_id", projectId)
    .eq("id", connectionId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) throw notFound("That channel connection doesn't exist.");
  return data;
}

// Creates or updates the project's connection for `channel`. Returns { connection, issuedSecret } —
// issuedSecret is the in-app identity secret, shown to the caller exactly once.
export async function connectChannel(db, { projectId, userId, channel, credentials = {}, rotate = false, subject }) {
  const provider = CHANNEL_PROVIDER[channel];
  if (!provider) throw badRequest("That channel can't be connected here.");

  const existing = await findChannelConnection(db, projectId, channel);
  const stored = await readSecrets(db, existing?.id);
  const secrets = readCredentials(channel, credentials, stored);
  let issuedSecret = null;
  let config = existing?.config || {};

  if (channel === "push" && (!secrets.vapidPrivateKey || !config.vapidPublicKey)) {
    const keys = generateVapidKeys();
    secrets.vapidPrivateKey = keys.privateKey;
    config = { ...config, vapidPublicKey: keys.publicKey };
  }
  if (channel === "in_app" && (!secrets.identitySecret || rotate)) {
    secrets.identitySecret = newIdentitySecret();
    issuedSecret = secrets.identitySecret;
  }

  const result = await probe(channel, secrets, existing ? { ...existing, config } : { config }, { subject });
  if (!result.ok) throw new ApiError(422, result.error, "verification_failed");

  const now = new Date().toISOString();
  const row = {
    ...result.patch,
    project_id: projectId,
    channel,
    provider,
    last_checked_at: now,
    connected_at: result.patch.status === "connected" ? existing?.connected_at || now : existing?.connected_at || null,
  };

  const query = existing
    ? db.from("channel_connections").update(row).eq("id", existing.id)
    : db.from("channel_connections").insert({ ...row, created_by: userId || null });
  const { data: connection, error } = await query.select("*").single();
  if (error) {
    if (error.code === "23505") throw new ApiError(409, "This account is already connected to another Geiger project.", "conflict");
    console.error("[channels.connect]", error.message);
    throw new ApiError(500, "Couldn't save the connection.", "save_failed");
  }

  if (Object.keys(secrets).length) {
    const saved = await saveConnectionSecrets(db, { projectId, connectionId: connection.id, secrets });
    if (!saved) throw new ApiError(500, "Couldn't store the credentials.", "save_failed");
  }
  return { connection, issuedSecret };
}

// Re-checks a connection against its provider and records the outcome (status, health, config).
export async function verifyConnection(db, connection) {
  const secrets = await readSecrets(db, connection.id);
  const result = await probe(connection.channel, secrets, connection);
  const now = new Date().toISOString();
  const patch = result.ok
    ? { ...result.patch, last_checked_at: now }
    : { status: "error", health: { ...(connection.health || {}), lastError: result.error, checkedAt: now }, last_checked_at: now };
  const { data, error } = await db.from("channel_connections").update(patch).eq("id", connection.id).select("*").single();
  if (error) throw new ApiError(500, "Couldn't record the health check.", "save_failed");
  return data;
}

export async function disconnectConnection(db, connection) {
  const { error } = await db
    .from("channel_connections")
    .update({ status: "disconnected", deleted_at: new Date().toISOString() })
    .eq("id", connection.id);
  if (error) throw new ApiError(500, "Couldn't disconnect the channel.", "save_failed");
  await db.from("channel_secrets").delete().eq("connection_id", connection.id);
  return true;
}

// Points a Twilio number's inbound SMS webhook at this app, then refreshes the numbers list.
export async function routeNumberInbound(db, connection, numberSid) {
  const secrets = await readSecrets(db, connection.id);
  const res = await twilio.setInboundUrl(secrets, numberSid, twilioInboundUrl());
  if (!res.ok) throw new ApiError(502, res.error.message, "provider_error");
  return verifyConnection(db, connection);
}

const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function testEmailHtml({ fromName, fromEmail }) {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f5f4;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c1917">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e7e5e4;border-radius:12px">
<tr><td style="padding:28px 32px">
<p style="margin:0 0 12px;font-size:16px;font-weight:600">This is a test email from Geiger Campaign.</p>
<p style="margin:0 0 8px;font-size:14px;line-height:22px">It was sent from <strong>${escapeHtml(fromName || fromEmail)}</strong> &lt;${escapeHtml(fromEmail)}&gt; through Geiger Dash.</p>
<p style="margin:0;font-size:14px;line-height:22px;color:#57534e">If it reached your inbox, this sender identity can send campaign and transactional email.</p>
</td></tr></table></td></tr></table></body></html>`;
}

// One real send through dispatch, logged as a test delivery.
export async function testConnection(db, { projectId, connection, userId, body = {} }) {
  const to = trimmed(body.to);
  const meta = { test: true, sentBy: userId || null };
  let message;
  let recipient = to;

  switch (connection.channel) {
    case "email": {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw badRequest("Enter an email address to send the test to.");
      const senders = Array.isArray(connection.metadata?.senders) ? connection.metadata.senders : [];
      const sender = senders.find((s) => s.id === body.senderId) || senders.find((s) => s.isDefault) || null;
      if (sender) meta.senderId = sender.id;
      const from = sender?.email ? (sender.fromName ? `${sender.fromName} <${sender.email}>` : sender.email) : undefined;
      meta.from = sender?.email || null;
      message = {
        subject: "Test email from Geiger Campaign",
        html: testEmailHtml({ fromName: sender?.fromName, fromEmail: sender?.email || "the default sender" }),
        from,
        label: "campaign.test",
      };
      break;
    }
    case "sms":
      if (!twilio.toE164(to)) throw badRequest("Enter a phone number in international format.");
      message = { body: trimmed(body.body) || "Test message from Geiger Campaign.", from: trimmed(body.from) || undefined };
      break;
    case "whatsapp": {
      if (!wa.toWaId(to)) throw badRequest("Enter a WhatsApp number in international format.");
      if (body.templateId) {
        const { data: template } = await db
          .from("message_templates")
          .select("*")
          .eq("project_id", projectId)
          .eq("id", body.templateId)
          .is("deleted_at", null)
          .maybeSingle();
        if (!template) throw notFound("That template doesn't exist.");
        message = { template: { id: template.id, variables: body.variables || sampleVariables(template) } };
      } else {
        message = { text: trimmed(body.text) || "Test message from Geiger Campaign." };
      }
      break;
    }
    case "push":
      recipient = trimmed(body.subscriptionId || body.contactId || to);
      if (!recipient) throw badRequest("Pick a subscription to send the test to.");
      message = { title: trimmed(body.title) || "Test notification", body: trimmed(body.body) || "Sent from Geiger Campaign.", url: trimmed(body.url) };
      break;
    case "in_app":
      if (!recipient) throw badRequest("Pick a contact to send the test to.");
      message = { title: trimmed(body.title) || "Test message", body: trimmed(body.body) || "Sent from Geiger Campaign.", expiresInDays: 1 };
      break;
    default:
      throw badRequest("Test sends aren't available for this channel.");
  }

  return dispatch({
    db,
    projectId,
    channel: connection.channel,
    to: recipient,
    contactId: body.contactId || null,
    connectionId: connection.id,
    source: { type: "test", id: null },
    message,
    metadata: meta,
  });
}

// Fresh secrets for a send outside dispatch (template submit/sync).
export async function connectionWithSecrets(db, projectId, channel, connectionId = null) {
  const { connection, secrets } = await loadConnection(db, projectId, channel, connectionId);
  return { connection, secrets: secrets || {} };
}
