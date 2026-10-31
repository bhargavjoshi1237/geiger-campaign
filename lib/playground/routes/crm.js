// Playground stand-ins for the CRM routes and the deals triggers, over the in-memory db. Mirrors
// lib/crm/server.js (close deal, company contact linking) and supabase/migrations/*_crm.sql (stage
// history + deal_won tracked events) so the demo's history and attribution stay consistent.

import { getPlaygroundDb } from "../db.js";
import { json } from "../intercept_fetch.js";
import { PLAYGROUND_PERSON } from "../cast.js";
import { dealDerivedFields, dealHistoryRows, dealWonSync } from "../../crm/deal_events.js";
import { emailDomain, isFreeMailDomain, normalizeDomain } from "../../crm/domains.js";

const newId = () => globalThis.crypto.randomUUID();
const live = (db, table) => (db.has(table) ? db.table(table) : []);

// Writes the trigger side effects of oldRow -> row (both raw deal rows) into the db.
function applyDealEffects(db, oldRow, row, actorId = PLAYGROUND_PERSON.id) {
  const nowIso = new Date().toISOString();
  const pipelines = live(db, "pipelines").map((p) => ({ id: p.id, stages: p.stages || [] }));
  const history = dealHistoryRows(oldRow, row, { pipelines, nowIso, actorId, newId });
  if (history.length && db.has("crm_activities")) db.table("crm_activities").unshift(...history);

  if (!db.has("tracked_events")) return;
  const events = db.table("tracked_events");
  const sync = dealWonSync(oldRow, row, { trackedEvents: events, nowIso, newId });
  if (sync.insert) events.unshift(sync.insert);
  if (sync.update) Object.assign(sync.update[0], sync.update[1]);
  for (const e of sync.retract) Object.assign(e, { deleted_at: nowIso, updated_at: nowIso });
}

function pipelineList(db) {
  return live(db, "pipelines").map((p) => ({ id: p.id, stages: p.stages || [] }));
}

// Compose into createMemoryClient({ hooks }) so plain data-layer writes to deals behave like the triggers.
export const crmWriteHooks = {
  beforeWrite({ op, table, input, rows, patch, db }) {
    if (table !== "deals") return undefined;
    const nowIso = new Date().toISOString();
    if (op === "insert") {
      for (const next of input) Object.assign(next, dealDerivedFields(null, { status: "open", ...next }, pipelineList(db), nowIso));
      return undefined;
    }
    if (op !== "update" || !patch) return undefined;
    // The patch is shared by every matched row, so derived columns are only folded in for single-row updates.
    for (const current of rows) {
      const before = { ...current };
      const derived = dealDerivedFields(before, { ...current, ...patch }, pipelineList(db), nowIso);
      if (rows.length === 1) Object.assign(patch, derived);
      applyDealEffects(db, before, { ...current, ...patch, ...derived });
    }
    return undefined;
  },
  afterWrite({ op, table, rows, db }) {
    if (table !== "deals" || op !== "insert") return;
    for (const row of rows) applyDealEffects(db, null, row, row.created_by || PLAYGROUND_PERSON.id);
  },
};

function closeDeal({ params, body }) {
  const db = getPlaygroundDb();
  const status = body?.status;
  if (!["open", "won", "lost"].includes(status)) return json({ error: "Status must be open, won or lost." }, 400);
  const deal = live(db, "deals").find((d) => d.id === params.dealId && d.project_id === params.projectId && !d.deleted_at);
  if (!deal) return json({ error: "That deal doesn't exist." }, 404);
  const reason = String(body?.lostReason || "").trim().slice(0, 500);
  if (deal.status === status && (status !== "lost" || deal.lost_reason === reason)) return { deal };

  const nowIso = new Date().toISOString();
  const before = { ...deal };
  Object.assign(deal, {
    status,
    lost_reason: status === "lost" ? reason : "",
    won_at: status === "won" ? nowIso : null,
    lost_at: status === "lost" ? nowIso : null,
    updated_at: nowIso,
  });
  applyDealEffects(db, before, deal);
  return { deal: { ...deal } };
}

function companyContacts({ params, body }) {
  const db = getPlaygroundDb();
  const company = live(db, "companies").find((c) => c.id === params.companyId && c.project_id === params.projectId && !c.deleted_at);
  if (!company) return json({ error: "That company doesn't exist." }, 404);
  const contacts = live(db, "contacts").filter((c) => c.project_id === params.projectId && !c.deleted_at);
  const nowIso = new Date().toISOString();
  const action = body?.action;

  if (action === "link" || action === "unlink") {
    const ids = new Set((Array.isArray(body?.contactIds) ? body.contactIds : []).filter((id) => typeof id === "string"));
    if (!ids.size) return json({ error: "Pick at least one contact." }, 400);
    let changed = 0;
    for (const c of contacts) {
      if (!ids.has(c.id)) continue;
      if (action === "unlink" && c.company_id !== company.id) continue;
      Object.assign(c, { company_id: action === "link" ? company.id : null, updated_at: nowIso });
      changed += 1;
    }
    return action === "link"
      ? { linked: changed, unlinked: 0, skipped: ids.size - changed, alreadyLinked: 0 }
      : { linked: 0, unlinked: changed, skipped: 0, alreadyLinked: 0 };
  }

  if (action !== "match_domain") return json({ error: "Unknown action." }, 400);
  const domain = normalizeDomain(company.domain);
  if (!domain) return json({ error: "Add a domain to this company first." }, 400);
  if (isFreeMailDomain(domain)) return json({ error: `${domain} is a personal email provider, so its contacts can't be matched to a company.` }, 400);

  const matches = contacts.filter((c) => emailDomain(c.email) === domain);
  const overwrite = Boolean(body?.overwrite);
  let linked = 0;
  for (const c of matches) {
    if (c.company_id === company.id || (c.company_id && !overwrite)) continue;
    Object.assign(c, { company_id: company.id, updated_at: nowIso });
    linked += 1;
  }
  return {
    linked,
    unlinked: 0,
    skipped: overwrite ? 0 : matches.filter((c) => c.company_id && c.company_id !== company.id).length,
    alreadyLinked: matches.filter((c) => c.company_id === company.id).length - linked,
    domain,
  };
}

export const crmRoutes = [
  ["POST", "/api/projects/:projectId/crm/deals/:dealId/close", closeDeal],
  ["POST", "/api/projects/:projectId/crm/companies/:companyId/contacts", companyContacts],
];
