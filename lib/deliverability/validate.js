import { combineResult, precheckEmail } from "./email_check.js";
import { lookupA, lookupMx, mapLimit } from "./dns.js";

// Email validation (server-only): the pure checks plus MX lookups, with one DNS lookup per domain per
// batch. Deliberately no SMTP mailbox probing — RCPT checks are unreliable behind catch-all and
// greylisting servers and burn the sender's reputation — so "valid" means the address can receive mail.

export const MAX_BATCH = 200;

async function checkDomain(domain) {
  const mx = await lookupMx(domain);
  if (!mx.error && mx.answers.length) {
    const nullMx = mx.answers.length === 1 && ["", "."].includes(String(mx.answers[0].exchange));
    if (nullMx) return { reasons: ["null_mx"], mx: [] };
    return {
      reasons: [],
      mx: mx.answers.slice(0, 5).map((m) => ({ exchange: String(m.exchange).replace(/\.$/, ""), priority: m.priority })),
    };
  }
  if (mx.error && mx.error !== "missing") return { reasons: ["dns_error"], mx: [] };
  if (mx.code === "ENOTFOUND") return { reasons: ["domain_not_found"], mx: [] };
  // No MX: RFC 5321 §5.1 falls back to the domain's own address record.
  const a = await lookupA(domain);
  if (a.answers.length) return { reasons: ["a_fallback"], mx: [] };
  if (a.error && a.error !== "missing") return { reasons: ["dns_error"], mx: [] };
  return { reasons: ["no_mx"], mx: [] };
}

// [{ email, domain, result, reasons, suggestion, mx, problem }] in input order.
export async function validateEmails(emails, { concurrency = 8 } = {}) {
  const domains = new Map();
  const domainCheck = (domain) => {
    if (!domains.has(domain)) domains.set(domain, checkDomain(domain));
    return domains.get(domain);
  };
  return mapLimit(emails.slice(0, MAX_BATCH), concurrency, async (raw) => {
    const pre = precheckEmail(raw);
    if (!pre.syntaxOk) {
      return { email: pre.email, domain: pre.domain, result: "invalid", reasons: ["syntax"], suggestion: null, mx: [], problem: pre.problem };
    }
    const dns = await domainCheck(pre.domain);
    const reasons = [...dns.reasons, ...pre.reasons];
    return { email: pre.email, domain: pre.domain, result: combineResult(reasons), reasons, suggestion: pre.suggestion, mx: dns.mx, problem: null };
  });
}

// Upserts results into campaign.email_validations (one row per address); returns the saved rows.
export async function saveValidations(db, projectId, results, { source = "manual", contactIds = {}, createdBy = null, now = new Date() } = {}) {
  if (!results.length) return [];
  const checkedAt = now.toISOString();
  const rows = results
    .filter((r) => r.email)
    .map((r) => ({
      project_id: projectId,
      email: r.email,
      domain: r.domain || "",
      result: r.result,
      reasons: r.reasons,
      suggestion: r.suggestion,
      mx: r.mx,
      checked_at: checkedAt,
      contact_id: contactIds[r.email] || null,
      source,
      metadata: r.problem ? { problem: r.problem } : {},
      created_by: createdBy,
      deleted_at: null,
    }));
  const { data, error } = await db.from("email_validations").upsert(rows, { onConflict: "project_id,email" }).select("*");
  if (error) {
    console.error("[deliverability.validations.save]", error.message);
    return null;
  }
  return data || [];
}

// Mirrors each result onto the contact (contacts.metadata.emailValidation) through the service-role merge.
export async function stampContacts(adminDb, results, contactIds, { now = new Date() } = {}) {
  if (!adminDb) return 0;
  let stamped = 0;
  await mapLimit(results.filter((r) => contactIds[r.email]), 6, async (r) => {
    const { error } = await adminDb.rpc("merge_meta", {
      p_table: "contacts",
      p_id: contactIds[r.email],
      p_patch: { emailValidation: { result: r.result, reasons: r.reasons, suggestion: r.suggestion, checkedAt: now.toISOString() } },
    });
    if (error) console.error("[deliverability.validations.stamp]", error.message);
    else stamped += 1;
  });
  return stamped;
}
