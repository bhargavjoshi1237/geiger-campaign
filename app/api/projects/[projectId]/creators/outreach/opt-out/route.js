import { applyOptOut, loadOptOut } from "@/lib/creators/outreach";
import { adminClient } from "@/lib/supabase/admin";
import { clientInfo, escapeHtml, notFoundPage, publicPage } from "@/lib/creators/public_page";

// Public opt-out link from creator outreach emails (signed token, no session). GET confirms, POST
// applies — so link scanners that prefetch the URL can't opt anyone out.
export const runtime = "nodejs";

const UUID = /^[0-9a-f-]{36}$/i;

async function tokenFrom(request) {
  const fromUrl = new URL(request.url).searchParams.get("t");
  if (request.method !== "POST") return fromUrl;
  const form = await request.formData().catch(() => null);
  return form?.get("t") || fromUrl;
}

export async function GET(request, { params }) {
  const { projectId } = await params;
  const db = adminClient();
  const token = await tokenFrom(request);
  if (!db || !UUID.test(projectId) || !token) return notFoundPage();
  const found = await loadOptOut(db, projectId, token);
  if (!found) return notFoundPage();
  const brand = escapeHtml(found.brandName || "this sender");
  if (found.already) {
    return publicPage({ title: "You're opted out", body: `<h1>You're opted out</h1><p>You won't receive further outreach emails from <strong>${brand}</strong>.</p>` });
  }
  return publicPage({
    title: "Stop outreach emails",
    body: `<h1>Stop outreach emails?</h1><p><strong>${brand}</strong> won't send you any more collaboration outreach once you confirm.</p>
<form method="post"><input type="hidden" name="t" value="${escapeHtml(token)}"><button class="primary" type="submit">Opt out</button></form>`,
  });
}

export async function POST(request, { params }) {
  const { projectId } = await params;
  const db = adminClient();
  const token = await tokenFrom(request);
  if (!db || !UUID.test(projectId) || !token) return notFoundPage();
  const result = await applyOptOut(db, projectId, token, clientInfo(request));
  if (!result) return notFoundPage();
  const brand = escapeHtml(result.brandName || "this sender");
  return publicPage({ title: "You're opted out", body: `<h1>You're opted out</h1><p>You won't receive further outreach emails from <strong>${brand}</strong>.</p>` });
}
