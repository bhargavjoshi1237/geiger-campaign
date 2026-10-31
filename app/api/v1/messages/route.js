import { extractApiKey, verifyApiKey } from "@/lib/server/api_keys";
import { forbidden, handle, json, readJson, unauthorized } from "@/lib/server/http";
import { sendTransactionalMessage } from "@/lib/channels/transactional";
import { requireAdminDb } from "@/lib/channels/route_context";

export const runtime = "nodejs";

// Developer API: send one transactional message. Secret key with the messages:send scope.
//   { "to": "a@b.co", "template": "order_receipt", "data": { … } }       email from a template
//   { "to": "a@b.co", "subject": "…", "html": "<p>…</p>" }                raw email
//   { "channel": "sms", "to": "+14155550142", "text": "…" }               SMS
//   { "channel": "whatsapp", "to": "+…", "template": "order_update", "language": "en_US", "variables": { "body": ["…"] } }
// Idempotency-Key header (or idempotencyKey) makes retries safe.
export async function POST(request) {
  return handle("v1.messages.send", async () => {
    const db = requireAdminDb();
    const key = extractApiKey(request);
    if (!key) throw unauthorized("Pass a secret API key: Authorization: Bearer gck_…");
    const auth = await verifyApiKey(db, key, { scope: "messages:send" });
    if (!auth?.projectId) throw unauthorized("The API key is invalid or lacks the messages:send scope.");
    if (auth.kind === "public") throw forbidden("Public keys can't send messages — use a secret key.");

    const body = await readJson(request);
    const idempotencyKey = request.headers.get("idempotency-key") || body.idempotencyKey || null;
    const result = await sendTransactionalMessage(db, { projectId: auth.projectId, body, keyId: auth.keyId, idempotencyKey });

    const status = result.duplicate ? 200 : ["sent", "delivered", "queued"].includes(result.status) ? 202 : result.status === "not_sent" ? 422 : 502;
    return json(
      { id: result.deliveryId, status: result.status, error: result.error || null, ...(result.duplicate ? { duplicate: true } : {}) },
      status,
    );
  });
}
