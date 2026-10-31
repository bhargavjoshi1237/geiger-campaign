import { requirePermission } from "@/lib/server/auth";
import { badRequest, handle, readJson } from "@/lib/server/http";
import { adminClient } from "@/lib/supabase/admin";
import { splitEmails } from "@/lib/deliverability/email_check";
import { MAX_BATCH, saveValidations, stampContacts, validateEmails } from "@/lib/deliverability/validate";

// Validates pasted addresses (body { emails: string[] | string }, up to 200 per call): syntax, MX/A,
// disposable, role and typo checks. Results upsert into email_validations; addresses that belong to a
// contact also stamp contacts.metadata.emailValidation.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request, { params }) {
  return handle("deliverability.validations", async () => {
    const { projectId } = await params;
    const { db, user } = await requirePermission(projectId, "campaign.deliverability.manage");
    const body = await readJson(request);
    const emails = Array.isArray(body?.emails) ? splitEmails(body.emails.join("\n")) : splitEmails(body?.emails);
    if (!emails.length) throw badRequest("Add at least one address.");
    if (emails.length > MAX_BATCH) throw badRequest(`Validate up to ${MAX_BATCH} addresses per request.`);

    const results = await validateEmails(emails);
    const { data: contacts } = await db
      .from("contacts")
      .select("id, email")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .in("email", results.map((r) => r.email));
    const contactIds = Object.fromEntries((contacts || []).map((c) => [String(c.email).toLowerCase(), c.id]));
    const rows = await saveValidations(db, projectId, results, { source: "manual", contactIds, createdBy: user.id });
    if (rows === null) throw badRequest("Couldn't save the results.");
    const stamped = await stampContacts(adminClient(), results, contactIds);

    const counts = { valid: 0, risky: 0, invalid: 0, unknown: 0 };
    for (const r of results) counts[r.result] += 1;
    return { rows, counts, stamped };
  });
}
