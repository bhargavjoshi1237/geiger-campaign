// Playground stand-ins for the deliverability routes, answered from the in-memory seed. The browser has
// no DNS, so checks replay the last recorded answers (domains re-run the real evaluator over stored
// records) and anything genuinely new is marked as a playground sample. Test sends write real rows to the
// in-memory deliveries table, exactly as dispatch would.

import { getPlaygroundDb } from "../db.js";
import { json } from "../intercept_fetch.js";
import { evaluateDomain, lookupsFromRecords } from "../../deliverability/auth_checks.js";
import { DOMAIN_BLOCKLISTS, IP_BLOCKLISTS } from "../../deliverability/blocklists.js";
import { combineResult, precheckEmail, splitEmails } from "../../deliverability/email_check.js";
import { computeDeliverabilityHealth } from "../../deliverability/health.js";
import { mailboxProvider, runPreflight } from "../../deliverability/preflight.js";
import { addDaysIso, capForDay, planState, warmupDay } from "../../deliverability/warmup_curves.js";
import { normalizeDomainName } from "../../deliverability/records.js";
import { applyMergeTags } from "../../email/merge_tags.js";
import { matchesConditions } from "../../audience/segment_rules.js";
import { normalizeContact } from "../../supabase/contacts.js";

const SAMPLE_NOTE = "Playground sample: the browser can't query DNS, so live checks run only in the workspace.";
// Consumer domains whose MX is public knowledge, so the playground can call them deliverable.
const KNOWN_MX = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com", "me.com", "protonmail.com", "proton.me", "fastmail.com", "halcyon.studio"]);

const now = () => new Date().toISOString();
const live = (rows) => rows.filter((r) => r.deleted_at == null);
const byProject = (rows, projectId) => live(rows).filter((r) => r.project_id === projectId);
const notFound = (message) => json({ error: message }, 404);

function find(table, projectId, id) {
  return byProject(getPlaygroundDb().table(table), projectId).find((r) => r.id === id) || null;
}

// Copies a target's latest run with a fresh timestamp, or writes sample clear rows for a new target.
function replayBlocklistRun(projectId, target, targetType, link = {}) {
  const db = getPlaygroundDb();
  const history = byProject(db.table("blocklist_checks"), projectId)
    .filter((r) => r.target === target)
    .sort((a, b) => String(b.checked_at).localeCompare(String(a.checked_at)));
  const lastRun = history[0]?.run_id;
  const source = lastRun
    ? history.filter((r) => r.run_id === lastRun)
    : (targetType === "ip" ? IP_BLOCKLISTS : DOMAIN_BLOCKLISTS).map((list) => ({
        checked_value: target,
        list: list.zone,
        list_name: list.name,
        status: "clear",
        listed: false,
        detail: SAMPLE_NOTE,
        codes: [],
      }));
  const runId = globalThis.crypto.randomUUID();
  const at = now();
  const rows = source.map((r) => ({
    id: globalThis.crypto.randomUUID(),
    project_id: projectId,
    target,
    target_type: targetType,
    checked_value: r.checked_value,
    list: r.list,
    list_name: r.list_name,
    status: r.status,
    listed: r.listed,
    detail: r.detail,
    codes: r.codes || [],
    run_id: runId,
    sending_domain_id: link.sendingDomainId || null,
    dedicated_ip_id: link.dedicatedIpId || null,
    checked_at: at,
    metadata: { playground: true },
    created_by: null,
    created_at: at,
    updated_at: at,
    deleted_at: null,
  }));
  db.table("blocklist_checks").unshift(...rows);
  return rows;
}

function validate(email) {
  const pre = precheckEmail(email);
  if (!pre.syntaxOk) return { email: pre.email, domain: pre.domain, result: "invalid", reasons: ["syntax"], suggestion: null, mx: [], problem: pre.problem };
  const reasons = KNOWN_MX.has(pre.domain) ? [...pre.reasons] : ["dns_error", ...pre.reasons];
  return { email: pre.email, domain: pre.domain, result: combineResult(reasons), reasons, suggestion: pre.suggestion, mx: [], problem: KNOWN_MX.has(pre.domain) ? null : SAMPLE_NOTE };
}

function saveValidations(projectId, results, { source, contactIds = {} }) {
  const db = getPlaygroundDb();
  const table = db.table("email_validations");
  const at = now();
  return results.map((r) => {
    const existing = table.find((x) => x.project_id === projectId && x.email === r.email);
    const fields = {
      domain: r.domain,
      result: r.result,
      reasons: r.reasons,
      suggestion: r.suggestion,
      mx: r.mx,
      checked_at: at,
      contact_id: contactIds[r.email] || existing?.contact_id || null,
      source,
      metadata: r.problem ? { problem: r.problem } : {},
      updated_at: at,
      deleted_at: null,
    };
    if (existing) return Object.assign(existing, fields);
    const row = { id: globalThis.crypto.randomUUID(), project_id: projectId, email: r.email, created_by: null, created_at: at, ...fields };
    table.unshift(row);
    return row;
  });
}

function stampContacts(results, contactIds) {
  const contacts = getPlaygroundDb().table("contacts");
  for (const r of results) {
    const contact = contacts.find((c) => c.id === contactIds[r.email]);
    if (contact) contact.metadata = { ...(contact.metadata || {}), emailValidation: { result: r.result, reasons: r.reasons, suggestion: r.suggestion, checkedAt: now() } };
  }
}

const countResults = (results) => results.reduce((acc, r) => ({ ...acc, [r.result]: (acc[r.result] || 0) + 1 }), { valid: 0, risky: 0, invalid: 0, unknown: 0 });

function contactsInScope(projectId, scope) {
  const db = getPlaygroundDb();
  const contacts = byProject(db.table("contacts"), projectId).filter((c) => c.email);
  if (scope?.type === "list") {
    const ids = new Set(live(db.table("list_members")).filter((m) => m.list_id === scope.id && m.status !== "removed").map((m) => m.contact_id));
    return contacts.filter((c) => ids.has(c.id));
  }
  if (scope?.type === "segment") {
    const segment = find("segments", projectId, scope.id);
    if (!segment) return [];
    const members = live(db.table("list_members"));
    return contacts.filter((c) => {
      const listIds = new Set(members.filter((m) => m.contact_id === c.id).map((m) => m.list_id));
      return matchesConditions(normalizeContact(c), { match: segment.match, conditions: segment.conditions || [] }, { listIds, events: [], deliveries: [] });
    });
  }
  return contacts;
}

function sendsByDay(projectId, plan) {
  const counts = new Map();
  for (const d of byProject(getPlaygroundDb().table("deliveries"), projectId)) {
    if (d.channel !== plan.channel || ["failed", "not_sent"].includes(d.status)) continue;
    if (plan.connection_id && d.connection_id !== plan.connection_id) continue;
    const day = String(d.created_at).slice(0, 10);
    counts.set(day, (counts.get(day) || 0) + 1);
  }
  return counts;
}

function usageToday(projectId, plan) {
  const day = warmupDay(plan);
  const capToday = planState(plan) === "active" ? capForDay(plan.schedule, day) : null;
  const sentToday = sendsByDay(projectId, plan).get(addDaysIso(null, 0)) || 0;
  return { planId: plan.id, day, capToday, sentToday, remaining: capToday == null ? null : Math.max(0, capToday - sentToday) };
}

export const deliverabilityRoutes = [
  [
    "POST",
    "/api/projects/:projectId/deliverability/domains/:domainId/verify",
    ({ params }) => {
      const row = find("sending_domains", params.projectId, params.domainId);
      if (!row) return notFound("Sending domain not found.");
      const result = evaluateDomain(
        { domain: row.domain, provider: row.provider, region: row.region, settings: row.settings || {}, verifiedAt: row.verified_at },
        lookupsFromRecords(row.records),
        { spfLookupCounts: { [`send.${row.domain}`]: row.auth?.spf?.lookupCount ?? null } },
      );
      Object.assign(row, {
        records: result.records,
        auth: { ...result.auth, rootSpf: row.auth?.rootSpf || result.auth.rootSpf },
        status: result.status,
        verified_at: result.verifiedAt,
        last_checked_at: result.checkedAt,
        updated_at: now(),
      });
      return { domain: row, note: SAMPLE_NOTE };
    },
  ],
  [
    "POST",
    "/api/projects/:projectId/deliverability/ips/:ipId/check",
    ({ params }) => {
      const ip = find("dedicated_ips", params.projectId, params.ipId);
      if (!ip) return notFound("Dedicated IP not found.");
      const checks = replayBlocklistRun(params.projectId, ip.ip, "ip", { dedicatedIpId: ip.id });
      Object.assign(ip, { rdns_checked_at: now(), blocklist_checked_at: now(), updated_at: now() });
      const rdns = { status: ip.rdns_status, hostname: ip.reverse_dns, detail: SAMPLE_NOTE };
      return { ip, rdns, checks, note: SAMPLE_NOTE };
    },
  ],
  [
    "POST",
    "/api/projects/:projectId/deliverability/blocklists/check",
    ({ params, body }) => {
      const raw = String(body?.target || "").trim().toLowerCase();
      const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(raw);
      const target = isIp ? raw : normalizeDomainName(raw);
      if (!target) return json({ error: "Enter an IPv4 address or a domain name." }, 400);
      const ip = isIp ? byProject(getPlaygroundDb().table("dedicated_ips"), params.projectId).find((r) => r.ip === target) : null;
      const domain = !isIp ? byProject(getPlaygroundDb().table("sending_domains"), params.projectId).find((r) => r.domain === target) : null;
      const rows = replayBlocklistRun(params.projectId, target, isIp ? "ip" : "domain", { dedicatedIpId: ip?.id, sendingDomainId: domain?.id });
      if (ip) ip.blocklist_checked_at = now();
      if (domain) domain.blocklist_checked_at = now();
      return { target, targetType: isIp ? "ip" : "domain", rows, note: SAMPLE_NOTE, resolvedIps: [] };
    },
  ],
  [
    "POST",
    "/api/projects/:projectId/deliverability/validations",
    ({ params, body }) => {
      const emails = Array.isArray(body?.emails) ? splitEmails(body.emails.join("\n")) : splitEmails(body?.emails);
      if (!emails.length) return json({ error: "Add at least one address." }, 400);
      const results = emails.slice(0, 200).map(validate);
      const contacts = byProject(getPlaygroundDb().table("contacts"), params.projectId);
      const contactIds = Object.fromEntries(contacts.filter((c) => c.email).map((c) => [String(c.email).toLowerCase(), c.id]));
      const rows = saveValidations(params.projectId, results, { source: "manual", contactIds });
      stampContacts(results, contactIds);
      return { rows, counts: countResults(results), stamped: results.filter((r) => contactIds[r.email]).length };
    },
  ],
  [
    "POST",
    "/api/projects/:projectId/deliverability/validations/contacts",
    ({ params, body }) => {
      const cursor = Math.max(0, Number(body?.cursor) || 0);
      const size = Math.min(100, Math.max(1, Number(body?.batchSize) || 100));
      const all = contactsInScope(params.projectId, body?.scope);
      const batch = all.slice(cursor, cursor + size);
      const results = batch.map((c) => validate(c.email));
      const contactIds = Object.fromEntries(batch.map((c) => [String(c.email).toLowerCase(), c.id]));
      const rows = saveValidations(params.projectId, results, { source: "contacts", contactIds });
      stampContacts(results, contactIds);
      return {
        validated: results.length,
        skipped: 0,
        stamped: results.length,
        counts: countResults(results),
        total: all.length,
        nextCursor: cursor + batch.length,
        done: cursor + batch.length >= all.length,
        rows,
      };
    },
  ],
  [
    "POST",
    "/api/projects/:projectId/deliverability/placement/:testId/send",
    ({ params }) => {
      const db = getPlaygroundDb();
      const test = find("placement_tests", params.projectId, params.testId);
      if (!test) return notFound("Placement test not found.");
      if (!["draft", "failed"].includes(test.status)) return json({ error: "This test was already sent. Use Send again to run a new one." }, 400);
      const verified = byProject(db.table("sending_domains"), params.projectId).filter((d) => d.status === "verified").map((d) => d.domain);
      const fromDomain = String(test.from_email || "").split("@")[1]?.toLowerCase() || "";
      if (!verified.includes(fromDomain)) return json({ error: fromDomain ? `${fromDomain} isn't a verified sending domain.` : "Add a from address on a verified sending domain." }, 400);
      const seeds = (test.seed_addresses || []).filter((s) => precheckEmail(s.email).syntaxOk);
      if (!seeds.length) return json({ error: "Add at least one seed mailbox you can sign in to." }, 400);
      const campaign = test.content_source === "campaign" ? find("campaigns", params.projectId, test.campaign_id) : null;
      const subject = test.subject || campaign?.subject || "";
      const html = applyMergeTags(test.html || campaign?.html || "", { first_name: "" });
      if (!subject || !html) return json({ error: "The test needs a subject and content." }, 400);
      const at = now();
      const results = seeds.map((s) => {
        const delivery = {
          id: globalThis.crypto.randomUUID(),
          project_id: params.projectId,
          channel: "email",
          status: "sent",
          contact_id: null,
          to_address: s.email,
          source_type: "test",
          source_id: test.id,
          campaign_id: null,
          subject,
          provider: "geiger_email",
          provider_id: null,
          connection_id: null,
          error: null,
          cost: 0,
          currency: "USD",
          open_count: 0,
          click_count: 0,
          idempotency_key: `placement:${test.id}:1:${s.email}`,
          sent_at: at,
          metadata: { placementTestId: test.id, playground: true },
          created_by: null,
          created_at: at,
          updated_at: at,
          deleted_at: null,
        };
        db.table("deliveries").unshift(delivery);
        return { email: s.email, provider: s.provider || mailboxProvider(s.email), placement: "pending", deliveryId: delivery.id, deliveryStatus: "sent", error: null, recordedAt: null };
      });
      Object.assign(test, {
        status: "awaiting_results",
        results,
        subject,
        preflight: runPreflight({ subject, html, fromEmail: test.from_email, verifiedDomains: verified }),
        sent_at: at,
        metadata: { ...(test.metadata || {}), attempts: 1 },
        updated_at: at,
      });
      return { test };
    },
  ],
  [
    "GET",
    "/api/projects/:projectId/deliverability/warmup/:planId/progress",
    ({ params }) => {
      const plan = find("warmup_plans", params.projectId, params.planId);
      if (!plan) return notFound("Warm-up plan not found.");
      const counts = sendsByDay(params.projectId, plan);
      const lastDay = Math.min((plan.schedule || []).length, Math.max(0, warmupDay(plan)));
      const days = (plan.schedule || []).slice(0, lastDay).map((s) => {
        const date = addDaysIso(plan.start_date, s.day - 1);
        return { day: s.day, date, cap: s.cap, sent: counts.get(date) || 0 };
      });
      return { days, today: usageToday(params.projectId, plan) };
    },
  ],
  [
    "GET",
    "/api/projects/:projectId/deliverability/warmup/usage",
    ({ params }) => {
      const plans = byProject(getPlaygroundDb().table("warmup_plans"), params.projectId).filter((p) => p.status !== "completed");
      const usage = plans.map((p) => usageToday(params.projectId, p));
      const caps = {};
      for (const u of usage) {
        const plan = plans.find((p) => p.id === u.planId);
        if (u.capToday != null) caps[plan.channel] = (caps[plan.channel] ?? 0) + u.capToday;
      }
      const today = addDaysIso(null, 0);
      const remaining = Object.fromEntries(
        Object.entries(caps).map(([channel, cap]) => [channel, Math.max(0, cap - (sendsByDay(params.projectId, { channel }).get(today) || 0))]),
      );
      return { plans: Object.fromEntries(usage.map((u) => [u.planId, u])), remaining };
    },
  ],
  [
    "GET",
    "/api/projects/:projectId/deliverability/health",
    ({ params }) => {
      const db = getPlaygroundDb();
      const checks = byProject(db.table("blocklist_checks"), params.projectId).sort((a, b) => String(b.checked_at).localeCompare(String(a.checked_at)));
      return computeDeliverabilityHealth({
        domains: byProject(db.table("sending_domains"), params.projectId),
        checks,
        validations: byProject(db.table("email_validations"), params.projectId),
        plans: byProject(db.table("warmup_plans"), params.projectId),
      });
    },
  ],
];
