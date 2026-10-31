import { dispatch } from "@/lib/messaging/dispatch";
import { sendSuiteEmail } from "@/lib/email/client";
import { emitWebhook } from "@/lib/webhooks/emit";
import { signatureHeader } from "@/lib/webhooks/signing";
import { getWorkspaceSettings } from "@/lib/settings/server";
import { prepareTrackedEmail, preferencesUrl, unsubscribeUrl, webViewUrl } from "@/lib/email/tracking";
import { isSigningConfigured } from "@/lib/server/tokens";

// The engine's real side-effect dependencies (server-only): sends through dispatch, system mail through
// geiger-dash, outgoing webhooks, signed recipient links + tracking. The pure engine receives these
// injected, so the playground can run the same engine with sandbox stand-ins.

// Signed unsubscribe / preferences / web-view links for one delivery; refuses without a signing secret.
function emailLinks({ deliveryId, contactId, projectId }) {
  if (!isSigningConfigured()) {
    return { error: "CAMPAIGN_SIGNING_SECRET isn't configured, so unsubscribe links can't be signed." };
  }
  const ids = { deliveryId, contactId, projectId, campaignId: null };
  return { unsubscribe: unsubscribeUrl(ids), preferences: preferencesUrl(ids), webView: deliveryId ? webViewUrl(deliveryId) : null };
}

function trackEmail(html, { deliveryId, links, tracking, footer }) {
  return prepareTrackedEmail(html, {
    deliveryId,
    unsubscribe: links?.unsubscribe || null,
    skip: [links?.preferences, links?.webView].filter(Boolean),
    tracking: tracking || { opens: true, clicks: true },
    footer,
  });
}

async function sendSystemEmail({ to, subject, html, label }) {
  const res = await sendSuiteEmail({ to, subject, html, template: label || "campaign.automation.notify" });
  if (res.ok) return { ok: true, id: res.id || null };
  return { ok: false, error: res.error === "not_configured" ? "Email delivery isn't configured (GEIGER_EMAIL_API_KEY)." : res.error };
}

// JSON POST to a user's URL, signed like the suite's webhooks when a secret is set. No redirects followed.
async function postWebhook({ url, secret, event, payload }) {
  const body = JSON.stringify({ event, data: payload });
  const headers = { "Content-Type": "application/json", "User-Agent": "GeigerCampaign-Automations/1", "X-Geiger-Event": event };
  if (secret) headers["X-Geiger-Signature"] = signatureHeader(secret, body);
  try {
    const res = await fetch(url, { method: "POST", headers, body, redirect: "manual", signal: AbortSignal.timeout(10_000) });
    return res.ok ? { ok: true, status: res.status } : { ok: false, status: res.status, error: `The endpoint answered ${res.status}.` };
  } catch (error) {
    return { ok: false, status: null, error: error?.name === "TimeoutError" ? "The endpoint didn't answer within 10 seconds." : "The endpoint couldn't be reached." };
  }
}

export function serverDeps() {
  return {
    dispatch,
    sendSystemEmail,
    emitWebhook,
    postWebhook,
    getSettings: getWorkspaceSettings,
    emailLinks,
    trackEmail,
  };
}
