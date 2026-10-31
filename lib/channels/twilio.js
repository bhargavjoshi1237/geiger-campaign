import { createHmac, timingSafeEqual } from "node:crypto";

// Thin client for Twilio's Programmable Messaging REST API (server-only, basic auth from channel_secrets
// { accountSid, authToken }). Returns { ok, status, data, error } — never throws. Docs: twilio.com/docs/sms/api.

const API = "https://api.twilio.com/2010-04-01";

function authHeader({ accountSid, authToken }) {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

async function twilio(secrets, path, { method = "GET", form, query } = {}) {
  if (!secrets?.accountSid || !secrets?.authToken) {
    return { ok: false, status: 0, data: null, error: { message: "Twilio Account SID and Auth Token are required." } };
  }
  const url = new URL(path.startsWith("http") ? path : `${API}/Accounts/${encodeURIComponent(secrets.accountSid)}${path}`);
  for (const [key, value] of Object.entries(query || {})) if (value != null) url.searchParams.set(key, String(value));

  let body;
  if (form) {
    body = new URLSearchParams();
    for (const [key, value] of Object.entries(form)) {
      if (value == null || value === "") continue;
      for (const item of Array.isArray(value) ? value : [value]) body.append(key, String(item));
    }
  }
  try {
    const res = await fetch(url, {
      method,
      headers: { Authorization: authHeader(secrets), ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const message = res.status === 401 ? "Twilio rejected the Account SID or Auth Token." : data?.message || `Twilio returned HTTP ${res.status}.`;
      return { ok: false, status: res.status, data, error: { message, code: data?.code ?? null } };
    }
    return { ok: true, status: res.status, data, error: null };
  } catch (error) {
    console.error("[twilio]", method, path, error?.message);
    return { ok: false, status: 0, data: null, error: { message: "Couldn't reach Twilio.", uncertain: true } };
  }
}

// { friendly_name, status: active|suspended|closed, type: Trial|Full }
export function getAccount(secrets) {
  return twilio(secrets, ".json");
}

const TOLL_FREE = /^\+1(800|833|844|855|866|877|888)/;

function normalizeNumber(n) {
  const caps = n.capabilities || {};
  return {
    sid: n.sid,
    number: n.phone_number,
    friendlyName: n.friendly_name || "",
    type: TOLL_FREE.test(n.phone_number || "") ? "toll_free" : "long_code",
    capabilities: ["sms", "mms", "voice"].filter((c) => caps[c] || caps[c.toUpperCase()]),
    smsUrl: n.sms_url || "",
  };
}

function normalizeShortCode(s) {
  return { sid: s.sid, number: s.short_code, friendlyName: s.friendly_name || "", type: "short_code", capabilities: ["sms"], smsUrl: s.sms_url || "" };
}

// Every sending number on the account: long codes, toll-free numbers and short codes.
export async function listNumbers(secrets) {
  const [numbers, shortCodes] = await Promise.all([
    twilio(secrets, "/IncomingPhoneNumbers.json", { query: { PageSize: 100 } }),
    twilio(secrets, "/SMS/ShortCodes.json", { query: { PageSize: 100 } }),
  ]);
  if (!numbers.ok) return numbers;
  return {
    ok: true,
    status: 200,
    error: null,
    data: [
      ...(numbers.data?.incoming_phone_numbers || []).map(normalizeNumber),
      ...(shortCodes.ok ? shortCodes.data?.short_codes || [] : []).map(normalizeShortCode),
    ],
  };
}

// Points a number's inbound SMS webhook at `url` (PN… = phone number, SC… = short code).
export function setInboundUrl(secrets, sid, url) {
  const path = sid.startsWith("SC") ? `/SMS/ShortCodes/${sid}.json` : `/IncomingPhoneNumbers/${sid}.json`;
  return twilio(secrets, path, { method: "POST", form: { SmsUrl: url, SmsMethod: "POST" } });
}

// `from` is an E.164 number / short code, or a Messaging Service SID (MG…).
export function sendMessage(secrets, { to, from, body, mediaUrls = [], statusCallback }) {
  const service = /^MG[0-9a-f]{32}$/i.test(from || "");
  return twilio(secrets, "/Messages.json", {
    method: "POST",
    form: {
      To: to,
      ...(service ? { MessagingServiceSid: from } : { From: from }),
      Body: body,
      MediaUrl: mediaUrls,
      StatusCallback: statusCallback,
    },
  });
}

export function getMessage(secrets, sid) {
  return twilio(secrets, `/Messages/${encodeURIComponent(sid)}.json`);
}

// X-Twilio-Signature: base64(HMAC-SHA1(authToken, url + sorted(key + value)…)).
export function validateSignature(authToken, url, params, signature) {
  if (!authToken || !signature) return false;
  const payload = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + (params[key] ?? ""), url);
  const expected = Buffer.from(createHmac("sha1", authToken).update(payload, "utf8").digest("base64"));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const escapeXml = (s) =>
  String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);

// TwiML response: an optional auto-reply.
export function twiml(message) {
  const body = message ? `<Message>${escapeXml(message)}</Message>` : "";
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

// "+1 (415) 555-0142" -> "+14155550142"; short codes stay digits.
export function toE164(phone) {
  const raw = String(phone || "").trim();
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.length <= 6 && !raw.startsWith("+")) return digits;
  return `+${digits}`;
}

// Twilio MessageStatus -> deliveries.status.
export const TWILIO_STATUS = {
  accepted: "queued",
  scheduled: "queued",
  queued: "queued",
  sending: "sent",
  sent: "sent",
  delivered: "delivered",
  read: "read",
  undelivered: "failed",
  failed: "failed",
  canceled: "failed",
};
