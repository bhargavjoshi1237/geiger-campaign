import { applyPreferenceChange } from "@/lib/campaigns/unsubscribe";
import { json } from "@/lib/server/http";
import { adminClient } from "@/lib/supabase/admin";

// Unsubscribe / preference changes from the recipient page (form POST, redirects back to /u/<token>)
// and RFC 8058 one-click (POST ?t=<token> with List-Unsubscribe=One-Click, answers 200). No login:
// the signed token is the authorization.
export const runtime = "nodejs";

const ACTIONS = new Set(["all", "lists", "resubscribe"]);

async function readInput(request) {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    if (!form) return {};
    return {
      token: form.get("token"),
      action: form.get("action"),
      keep: form.getAll("keep").map(String),
      oneClick: form.get("List-Unsubscribe") === "One-Click",
    };
  }
  if (type.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    return { token: body?.token, action: body?.action, keep: Array.isArray(body?.keep) ? body.keep : [], json: true };
  }
  const text = await request.text().catch(() => "");
  return { oneClick: /List-Unsubscribe=One-Click/i.test(text) };
}

export async function POST(request) {
  const url = new URL(request.url);
  const input = await readInput(request);
  const token = String(input.token || url.searchParams.get("t") || "");
  const oneClick = Boolean(input.oneClick || (!input.action && url.searchParams.get("t")));
  const action = oneClick ? "all" : ACTIONS.has(input.action) ? input.action : "all";
  const db = adminClient();
  if (!db) return json({ error: "Preferences can't be changed right now." }, 503);

  const result = await applyPreferenceChange(db, token, {
    action,
    keepListIds: input.keep || [],
    method: oneClick ? "one_click" : "preference_centre",
    ip: (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null,
    userAgent: request.headers.get("user-agent"),
  });

  if (oneClick || input.json) {
    const ok = !["invalid"].includes(result.status);
    return json({ status: result.status }, ok ? 200 : 400);
  }
  const back = new URL(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/u/${encodeURIComponent(token)}`, request.url);
  back.searchParams.set("status", result.status);
  return Response.redirect(back, 303);
}
