import { badRequest, notFound } from "@/lib/server/http";
import { emitWebhook } from "@/lib/webhooks/emit";
import { emailDomain, isFreeMailDomain, normalizeDomain } from "./domains.js";

// Server-side CRM operations behind app/api/projects/[projectId]/crm/*. `db` is the caller's RLS-scoped
// campaign client; `adminDb` (service role, may be null) writes what the caller's role can't touch directly.

const STATUSES = ["open", "won", "lost"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 1000;
const MAX_PAGES = 20;

// Won / lost / reopen. The deals trigger logs the history and the deal_won tracked event; this adds the webhook.
export async function closeDeal(db, { projectId, dealId, status, lostReason = "", adminDb = null }) {
  if (!STATUSES.includes(status)) throw badRequest("Status must be open, won or lost.");
  const reason = String(lostReason || "").trim().slice(0, 500);

  const { data: deal, error } = await db
    .from("deals")
    .select("*")
    .eq("project_id", projectId)
    .eq("id", dealId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!deal) throw notFound("That deal doesn't exist.");
  if (deal.status === status && (status !== "lost" || deal.lost_reason === reason)) return { deal };

  const now = new Date().toISOString();
  const patch = {
    status,
    lost_reason: status === "lost" ? reason : "",
    won_at: status === "won" ? now : null,
    lost_at: status === "lost" ? now : null,
  };
  const { data: saved, error: saveError } = await db
    .from("deals")
    .update(patch)
    .eq("id", dealId)
    .eq("project_id", projectId)
    .select("*")
    .single();
  if (saveError) throw new Error(saveError.message);

  if (status === "won" && deal.status !== "won") {
    const reader = adminDb || db;
    let contact = null;
    if (saved.contact_id) {
      const { data } = await reader
        .from("contacts")
        .select("id, email, phone, first_name, last_name")
        .eq("id", saved.contact_id)
        .maybeSingle();
      if (data) contact = { id: data.id, email: data.email, phone: data.phone, firstName: data.first_name, lastName: data.last_name };
    }
    await emitWebhook(reader, projectId, "deal.won", {
      deal: {
        id: saved.id,
        name: saved.name,
        value: Number(saved.value) || 0,
        currency: saved.currency,
        pipelineId: saved.pipeline_id,
        stageId: saved.stage_id,
        companyId: saved.company_id,
        ownerId: saved.owner_id,
        sourceCampaignId: saved.source_campaign_id,
        wonAt: saved.won_at,
      },
      contact,
    });
  }
  return { deal: saved };
}

async function loadCompany(db, projectId, companyId) {
  const { data, error } = await db
    .from("companies")
    .select("*")
    .eq("project_id", projectId)
    .eq("id", companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw notFound("That company doesn't exist.");
  return data;
}

// Every live contact whose email is at `domain` (paged past PostgREST's row cap).
async function contactsAtDomain(db, projectId, domain) {
  const out = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await db
      .from("contacts")
      .select("id, email, company_id")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .ilike("email", `%@${domain}`)
      .order("created_at", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []).filter((c) => emailDomain(c.email) === domain));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// Returns how many rows actually changed (RLS can silently match none).
async function setCompany(db, projectId, ids, companyId) {
  let changed = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db
      .from("contacts")
      .update({ company_id: companyId })
      .eq("project_id", projectId)
      .in("id", ids.slice(i, i + 200))
      .select("id");
    if (error) throw new Error(error.message);
    changed += (data || []).length;
  }
  return changed;
}

// action: match_domain ({ overwrite }) | link ({ contactIds }) | unlink ({ contactIds }).
export async function updateCompanyContacts(db, { projectId, companyId, action, contactIds = [], overwrite = false, adminDb = null }) {
  const company = await loadCompany(db, projectId, companyId);
  const writer = adminDb || db;

  if (action === "link" || action === "unlink") {
    const ids = [...new Set((Array.isArray(contactIds) ? contactIds : []).filter((id) => typeof id === "string" && UUID.test(id)))].slice(0, 1000);
    if (!ids.length) throw badRequest("Pick at least one contact.");
    if (action === "link") {
      const linked = await setCompany(writer, projectId, ids, company.id);
      return { linked, unlinked: 0, skipped: ids.length - linked, alreadyLinked: 0 };
    }
    const { data, error } = await writer
      .from("contacts")
      .update({ company_id: null })
      .eq("project_id", projectId)
      .eq("company_id", company.id)
      .in("id", ids)
      .select("id");
    if (error) throw new Error(error.message);
    return { linked: 0, unlinked: (data || []).length, skipped: 0, alreadyLinked: 0 };
  }

  if (action !== "match_domain") throw badRequest("Unknown action.");
  const domain = normalizeDomain(company.domain);
  if (!domain) throw badRequest("Add a domain to this company first.");
  if (isFreeMailDomain(domain)) throw badRequest(`${domain} is a personal email provider, so its contacts can't be matched to a company.`);

  const matches = await contactsAtDomain(writer, projectId, domain);
  const alreadyLinked = matches.filter((c) => c.company_id === company.id).length;
  const elsewhere = matches.filter((c) => c.company_id && c.company_id !== company.id);
  const candidates = matches.filter((c) => c.company_id !== company.id && (overwrite || !c.company_id));
  const linked = await setCompany(writer, projectId, candidates.map((c) => c.id), company.id);
  return {
    linked,
    unlinked: 0,
    skipped: overwrite ? 0 : elsewhere.length,
    alreadyLinked,
    domain,
  };
}
