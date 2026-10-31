import { adminClient } from "@/lib/supabase/admin";
import { decideRights, loadRightsRequest } from "@/lib/creators/rights";
import { clientInfo, escapeHtml, notFoundPage, publicPage } from "@/lib/creators/public_page";

// Public UGC rights page from a rights-request email (signed token, no session). GET shows what's
// being asked; POST records the creator's approve/decline with time, IP and user agent as proof.
export const runtime = "nodejs";

const UUID = /^[0-9a-f-]{36}$/i;

const decidedPage = (brand, status) =>
  publicPage({
    title: status === "granted" ? "Permission granted" : "Request declined",
    body:
      status === "granted"
        ? `<h1>Thanks — permission granted</h1><p><strong>${brand}</strong> has your approval and a record of it. You can reply to their email any time with questions.</p>`
        : `<h1>Request declined</h1><p><strong>${brand}</strong> won't use this content. Thanks for letting them know.</p>`,
  });

export async function GET(request, { params }) {
  const { projectId } = await params;
  const db = adminClient();
  const token = new URL(request.url).searchParams.get("t");
  if (!db || !UUID.test(projectId) || !token) return notFoundPage();
  const found = await loadRightsRequest(db, projectId, token);
  if (!found) return notFoundPage();
  const brand = escapeHtml(found.brandName || "The brand");
  const { item } = found;
  if (item.rights_status === "granted" || item.rights_status === "denied") return decidedPage(brand, item.rights_status);
  if (item.rights_status !== "requested") return notFoundPage("This request is no longer open.");

  const what = escapeHtml(item.title || `your ${item.kind || "content"}`);
  const source = item.source_url ? ` (<a href="${escapeHtml(item.source_url)}" rel="noopener noreferrer" target="_blank">view</a>)` : "";
  return publicPage({
    title: "Content usage request",
    body: `<h1>Can ${brand} use your content?</h1>
<p><strong>${brand}</strong> would like to use ${what}${source} on ${escapeHtml(found.use)}.</p>
<p>You'll be credited. Approving records your consent with today's date.</p>
<form method="post"><input type="hidden" name="t" value="${escapeHtml(token)}">
<button class="primary" type="submit" name="decision" value="grant">Approve</button>
<button type="submit" name="decision" value="deny">Decline</button></form>`,
  });
}

export async function POST(request, { params }) {
  const { projectId } = await params;
  const db = adminClient();
  const form = await request.formData().catch(() => null);
  const token = form?.get("t") || new URL(request.url).searchParams.get("t");
  const decision = form?.get("decision") === "grant" ? "grant" : "deny";
  if (!db || !UUID.test(projectId) || !token) return notFoundPage();
  const result = await decideRights(db, projectId, token, { decision, ...clientInfo(request) });
  if (!result) return notFoundPage();
  return decidedPage(escapeHtml(result.brandName || "The brand"), result.item.rights_status);
}
