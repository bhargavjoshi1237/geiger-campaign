import { timingSafeEqual } from "node:crypto";

// Thin server-only client for the Telegram Bot API (fully open: DMs, channels, groups).
// Never throws: returns { ok, data, error }.

export async function telegramRequest(token, method, params = {}, { signal } = {}) {
  if (!token) return { ok: false, data: null, error: "missing_token" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: signal ?? AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => null);
    if (!data?.ok) return { ok: false, data, error: data?.description || `Telegram returned ${res.status}` };
    return { ok: true, data: data.result, error: null };
  } catch (error) {
    console.error("[telegram]", method, error?.message);
    return { ok: false, data: null, error: "request_failed" };
  }
}

// Webhook authenticity: the X-Telegram-Bot-Api-Secret-Token header must equal the secret set via setWebhook.
export function verifyTelegramSecret(header, expected) {
  if (!expected || typeof header !== "string") return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
