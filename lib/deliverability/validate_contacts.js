import { resolveAudience } from "@/lib/audience/resolve";
import { saveValidations, stampContacts, validateEmails } from "./validate.js";

// Bulk contact validation in bounded batches (server-only). The client calls the route repeatedly with
// the returned cursor until done; each call validates one batch, upserts email_validations and stamps
// contacts.metadata.emailValidation through the service-role merge.

export const CONTACT_BATCH = 100;
const FRESH_DAYS = 30;

async function batchAll(db, projectId, cursor, size) {
  const { data, count, error } = await db
    .from("contacts")
    .select("id, email, metadata", { count: cursor === 0 ? "exact" : undefined })
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .not("email", "is", null)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(cursor, cursor + size - 1);
  if (error) throw new Error(error.message);
  return { rows: data || [], total: count ?? null, scanned: (data || []).length };
}

async function batchList(db, projectId, listId, cursor, size) {
  const { data: members, count, error } = await db
    .from("list_members")
    .select("contact_id", { count: cursor === 0 ? "exact" : undefined })
    .eq("project_id", projectId)
    .eq("list_id", listId)
    .is("deleted_at", null)
    .neq("status", "removed")
    .order("id", { ascending: true })
    .range(cursor, cursor + size - 1);
  if (error) throw new Error(error.message);
  const ids = (members || []).map((m) => m.contact_id);
  if (!ids.length) return { rows: [], total: count ?? null, scanned: 0 };
  const { data, error: contactsError } = await db
    .from("contacts")
    .select("id, email, metadata")
    .in("id", ids)
    .is("deleted_at", null)
    .not("email", "is", null);
  if (contactsError) throw new Error(contactsError.message);
  return { rows: data || [], total: count ?? null, scanned: ids.length };
}

async function batchSegment(adminDb, projectId, segmentId, cursor, size) {
  const audience = await resolveAudience(adminDb, projectId, { segmentIds: [segmentId] }, { channel: "email" });
  const rows = (audience || []).slice(cursor, cursor + size);
  return { rows, total: (audience || []).length, scanned: rows.length };
}

const isFresh = (meta, now) => {
  const at = Date.parse(meta?.emailValidation?.checkedAt || "");
  return Number.isFinite(at) && now - at < FRESH_DAYS * 24 * 60 * 60 * 1000;
};

// scope: { type: "all" } | { type: "list", id } | { type: "segment", id }
export async function validateContactBatch(db, adminDb, projectId, { scope = { type: "all" }, cursor = 0, batchSize = CONTACT_BATCH, skipFresh = false, createdBy = null } = {}) {
  const size = Math.min(CONTACT_BATCH, Math.max(1, Number(batchSize) || CONTACT_BATCH));
  const start = Math.max(0, Number(cursor) || 0);
  const batch =
    scope.type === "list"
      ? await batchList(db, projectId, scope.id, start, size)
      : scope.type === "segment"
        ? await batchSegment(adminDb || db, projectId, scope.id, start, size)
        : await batchAll(db, projectId, start, size);

  const now = Date.now();
  const contacts = batch.rows.filter((c) => c.email && !(skipFresh && isFresh(c.metadata, now)));
  const contactIds = Object.fromEntries(contacts.map((c) => [String(c.email).toLowerCase(), c.id]));
  const results = await validateEmails(contacts.map((c) => c.email));
  const saved = await saveValidations(db, projectId, results, { source: "contacts", contactIds, createdBy });
  if (saved === null) throw new Error("Couldn't save validation results.");
  const stamped = await stampContacts(adminDb, results, contactIds);

  const counts = { valid: 0, risky: 0, invalid: 0, unknown: 0 };
  for (const r of results) counts[r.result] += 1;
  return {
    validated: results.length,
    skipped: batch.rows.length - contacts.length,
    stamped,
    counts,
    total: batch.total,
    nextCursor: start + batch.scanned,
    done: batch.scanned < size,
    rows: saved,
  };
}
