import { handle, readJson } from "@/lib/server/http";
import { assertUuid, requirePermission } from "@/lib/server/auth";
import { adminClient } from "@/lib/supabase/admin";
import { updateCompanyContacts } from "@/lib/crm/server";

// Link contacts to a company: body { action: "match_domain", overwrite? } | { action: "link" | "unlink", contactIds }
// -> { linked, unlinked, skipped, alreadyLinked }. A CRM operation, so it needs campaign.crm.edit, not contact.edit.
export const runtime = "nodejs";

export async function POST(request, { params }) {
  return handle("crm.companies.contacts", async () => {
    const { projectId, companyId } = await params;
    const { db } = await requirePermission(projectId, "campaign.crm.edit");
    assertUuid(companyId, "company id");
    const body = await readJson(request);
    return updateCompanyContacts(db, {
      projectId,
      companyId,
      action: body?.action,
      contactIds: body?.contactIds,
      overwrite: Boolean(body?.overwrite),
      adminDb: adminClient(),
    });
  });
}
