import { handle, json, notFound } from "@/lib/server/http";
import { readInboundEmail, runInboundRoute } from "@/lib/channels/inbound_email";
import { requireAdminDb } from "@/lib/channels/route_context";

export const runtime = "nodejs";

// Inbound email webhook, one URL per route (the secret is the route's address). Accepts Postmark,
// SendGrid Inbound Parse, Mailgun and plain JSON payloads. A failed forward answers 502 so the inbound
// provider retries.
export async function POST(request, { params }) {
  return handle("public.inbound.email", async () => {
    const { secret } = await params;
    if (!/^[a-f0-9]{24,64}$/i.test(secret || "")) throw notFound("Unknown inbound route.");
    const db = requireAdminDb();
    const { data: route } = await db.from("inbound_routes").select("*").eq("secret_key", secret).is("deleted_at", null).maybeSingle();
    if (!route) throw notFound("Unknown inbound route.");

    const email = await readInboundEmail(request);
    const result = await runInboundRoute(db, route, email);
    return json({ ok: result.ok, matched: result.matched, ...(result.error ? { error: result.error } : {}) }, result.ok ? 200 : 502);
  });
}
