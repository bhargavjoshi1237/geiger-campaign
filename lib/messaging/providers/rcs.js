import { googleAccessToken, googleRequest } from "@/lib/social/oauth/google";
import { RBM_SCOPE } from "@/lib/social/accounts/catalog";
import { tagDelivery } from "@/lib/social/accounts/guards";
import { notConnected } from "../connections";

// RCS provider: Google RCS Business Messaging (POST /v1/phones/{msisdn}/agentMessages) authenticated with the
// agent's service-account key. The delivery id is the RBM messageId, so retries are idempotent and receipts map
// back. Cost uses the operator-entered rates on the connection (config.rates). Returns { status, providerId, error, cost }.
export const name = "rcs";

const HOSTS = { europe: "europe-rcsbusinessmessaging.googleapis.com", asia: "asia-rcsbusinessmessaging.googleapis.com" };

function suggestions(message) {
  const out = [];
  for (const q of message.quickReplies || []) out.push({ reply: { text: String(q.title).slice(0, 25), postbackData: String(q.payload || q.title).slice(0, 2048) } });
  for (const b of message.buttons || []) {
    out.push(
      b.url
        ? { action: { text: String(b.title).slice(0, 25), postbackData: `open:${String(b.title).slice(0, 64)}`, openUrlAction: { url: b.url } } }
        : { reply: { text: String(b.title).slice(0, 25), postbackData: String(b.payload || b.title).slice(0, 2048) } },
    );
  }
  return out.slice(0, 11);
}

function contentMessage(message) {
  const text = String(message.text ?? message.body ?? "").trim();
  const media = (message.attachments || []).find((a) => a?.url && (a.type === "image" || a.type === "video"));
  const chips = suggestions(message);
  if (media) {
    return {
      richCard: {
        standaloneCard: {
          cardOrientation: "VERTICAL",
          cardContent: {
            ...(message.title ? { title: String(message.title).slice(0, 200) } : {}),
            ...(text ? { description: text.slice(0, 2000) } : {}),
            media: { height: "MEDIUM", contentInfo: { fileUrl: media.url } },
            ...(chips.length ? { suggestions: chips.slice(0, 4) } : {}),
          },
        },
      },
    };
  }
  if (!text) return null;
  return { text: text.slice(0, 3072), ...(chips.length ? { suggestions: chips } : {}) };
}

const e164 = (value) => {
  const digits = String(value || "").replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? digits : `+${digits}`;
};

export async function send({ db, deliveryId, to, message = {}, connection, secrets }) {
  if (!connection) return notConnected("RCS");
  if (connection.status === "disconnected") return { status: "not_sent", error: "RCS is disconnected." };
  const agentId = connection.config?.agentId || connection.external_id;
  if (!secrets?.serviceAccount || !agentId) return { status: "not_sent", error: "The RCS agent isn't fully configured — add the service account key again." };

  const content = contentMessage(message);
  if (!content) return { status: "failed", error: "The message is empty." };
  const auth = await googleAccessToken(secrets.serviceAccount, [RBM_SCOPE]);
  if (!auth.ok) return { status: "failed", error: `Google rejected the agent's service account: ${auth.error}` };

  const host = HOSTS[connection.config?.region] || "rcsbusinessmessaging.googleapis.com";
  const url = new URL(`https://${host}/v1/phones/${encodeURIComponent(e164(to))}/agentMessages`);
  url.searchParams.set("messageId", deliveryId);
  url.searchParams.set("agentId", agentId);
  const res = await googleRequest(url.toString(), { token: auth.token, method: "POST", body: { contentMessage: content } });
  if (!res.ok) {
    if (res.status === 404) {
      await tagDelivery(db, deliveryId, { blockedBy: "capability" });
      return { status: "failed", error: "This number isn't reachable on RCS (no RCS support, or not a registered tester while the agent is unlaunched)." };
    }
    return { status: "failed", error: res.error || "Google refused the message." };
  }
  const rates = connection.config?.rates || {};
  const rich = Boolean(content.richCard || content.suggestions?.length || (content.text || "").length > 160);
  return { status: "sent", providerId: deliveryId, error: null, cost: Number(rich ? rates.rich : rates.basic) || 0, connectionId: connection.id };
}
