import { dispatch } from "@/lib/messaging/dispatch";
import { isEmailConfigured } from "@/lib/email/client";
import { renderEmailDocument } from "@/lib/email/blocks";
import { applyMergeTags } from "@/lib/email/merge_tags";
import { getWorkspaceSettings } from "@/lib/settings/server";
import { adminClient } from "@/lib/supabase/admin";
import { badRequest, notConfigured } from "@/lib/server/http";
import { lookupMx, mapLimit } from "./dns.js";
import { parseEmail } from "./email_check.js";
import { mailboxProvider, runPreflight } from "./preflight.js";

// Seed-list inbox placement (server-only): one real test send per seed mailbox the user controls,
// through dispatch (source type "test"), from a verified sending domain. Placement per mailbox is then
// recorded by the user — there is no inbox API to read it automatically.

const MAX_SEEDS = 25;

// Business mailboxes: name the host from its MX so results group by Google Workspace / Microsoft 365.
async function refineProvider(email, provider) {
  if (provider !== "Other") return provider;
  const domain = email.split("@")[1];
  const mx = await lookupMx(domain);
  const host = String(mx.answers[0]?.exchange || "").toLowerCase();
  if (host.endsWith("google.com") || host.endsWith("googlemail.com")) return "Google Workspace";
  if (host.endsWith("protection.outlook.com")) return "Microsoft 365";
  if (host.includes("yahoodns") || host.includes("yahoo.com")) return "Yahoo";
  if (host.includes("zoho")) return "Zoho";
  return "Other";
}

async function testContent(db, projectId, test) {
  if (test.content_source === "campaign" && test.campaign_id) {
    const { data: campaign } = await db
      .from("campaigns")
      .select("subject, preheader, html, content")
      .eq("project_id", projectId)
      .eq("id", test.campaign_id)
      .maybeSingle();
    if (!campaign) throw badRequest("The campaign this test uses no longer exists.");
    const settings = await getWorkspaceSettings(adminClient() || db, projectId);
    const html = campaign.html || renderEmailDocument(campaign.content || {}, { brand: settings.branding, preheader: campaign.preheader }).html;
    return { subject: test.subject || campaign.subject, html };
  }
  return { subject: test.subject, html: test.html };
}

export async function sendPlacementTest(db, { projectId, test, userId = null }) {
  if (!["draft", "failed"].includes(test.status)) throw badRequest("This test was already sent. Use Send again to run a new one.");
  if (!isEmailConfigured()) {
    throw notConfigured("Email delivery isn't configured. Set GEIGER_EMAIL_API_KEY so test sends can leave through geiger-dash.");
  }
  const seeds = (Array.isArray(test.seed_addresses) ? test.seed_addresses : [])
    .map((s) => parseEmail(s?.email))
    .filter((s) => s.ok)
    .slice(0, MAX_SEEDS);
  if (!seeds.length) throw badRequest("Add at least one seed mailbox you can sign in to.");

  const fromDomain = String(test.from_email || "").split("@")[1]?.toLowerCase() || "";
  const { data: verified } = await db
    .from("sending_domains")
    .select("domain")
    .eq("project_id", projectId)
    .eq("status", "verified")
    .is("deleted_at", null);
  const verifiedDomains = (verified || []).map((d) => d.domain);
  if (!fromDomain || !verifiedDomains.includes(fromDomain)) {
    throw badRequest(fromDomain ? `${fromDomain} isn't a verified sending domain.` : "Add a from address on a verified sending domain.");
  }

  const { subject, html: rawHtml } = await testContent(db, projectId, test);
  if (!subject || !rawHtml) throw badRequest("The test needs a subject and content.");
  const html = applyMergeTags(rawHtml, { first_name: "", last_name: "", email: "" });
  const preflight = runPreflight({ subject, html, fromEmail: test.from_email, verifiedDomains });
  const attempt = Number(test.metadata?.attempts || 0) + 1;

  await db.from("placement_tests").update({ status: "sending", preflight }).eq("id", test.id);

  const results = await mapLimit(seeds, 4, async (seed) => {
    const provider = await refineProvider(seed.email, mailboxProvider(seed.email));
    const res = await dispatch({
      projectId,
      channel: "email",
      to: seed.email,
      source: { type: "test", id: test.id },
      idempotencyKey: `placement:${test.id}:${attempt}:${seed.email}`,
      message: { subject, html, from: test.from_email, label: "campaign.placement_test" },
      metadata: { placementTestId: test.id },
    });
    return {
      email: seed.email,
      provider,
      placement: "pending",
      deliveryId: res.deliveryId || null,
      deliveryStatus: res.status,
      error: res.error || null,
      recordedAt: null,
    };
  });

  const delivered = results.filter((r) => ["sent", "delivered", "queued"].includes(r.deliveryStatus));
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("placement_tests")
    .update({
      status: delivered.length ? "awaiting_results" : "failed",
      results,
      subject,
      preflight,
      sent_at: delivered.length ? now : null,
      metadata: { ...(test.metadata || {}), attempts: attempt, sentBy: userId },
    })
    .eq("id", test.id)
    .select("*")
    .single();
  if (error) {
    console.error("[deliverability.placement.save]", error.message);
    return null;
  }
  return data;
}
