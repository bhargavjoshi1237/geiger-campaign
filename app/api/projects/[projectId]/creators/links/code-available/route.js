import { badRequest, handle } from "@/lib/server/http";
import { requirePermission } from "@/lib/server/auth";
import { WRITE_KEY, serviceDb } from "@/lib/creators/server";

// GET ?code=LENA15&exceptId=<link id> -> { available } across every project (/a/<code> carries no project).
export const runtime = "nodejs";

export async function GET(request, { params }) {
  const { projectId } = await params;
  return handle("creators.links.codeAvailable", async () => {
    await requirePermission(projectId, WRITE_KEY);
    const search = new URL(request.url).searchParams;
    const code = String(search.get("code") || "").trim();
    if (!/^[A-Za-z0-9_-]{2,40}$/.test(code)) throw badRequest("Codes are 2–40 letters, numbers, dashes or underscores.");
    const { data, error } = await serviceDb()
      .from("affiliate_links")
      .select("id")
      .ilike("code", code.replace(/[%_\\]/g, (c) => "\\" + c))
      .is("deleted_at", null)
      .limit(2);
    if (error) throw new Error(error.message);
    const exceptId = search.get("exceptId");
    return { code, available: !(data || []).some((row) => row.id !== exceptId) };
  });
}
