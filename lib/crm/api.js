"use client";

import { apiPost } from "@/lib/api/client";
import { normalizeDeal } from "@/lib/supabase/deals";

// Browser calls to the CRM route handlers. Never throw: { ok, ..., error } so the screen owns the toast.

export async function closeDeal(projectId, dealId, { status, lostReason = "" }) {
  if (!projectId || !dealId) return { ok: false, error: "Missing deal." };
  const res = await apiPost(`/api/projects/${projectId}/crm/deals/${dealId}/close`, { status, lostReason });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, deal: normalizeDeal(res.data?.deal) };
}

// action: "match_domain" ({ overwrite }) | "link" | "unlink" ({ contactIds }).
export async function updateCompanyContacts(projectId, companyId, { action, contactIds, overwrite = false }) {
  if (!projectId || !companyId) return { ok: false, error: "Missing company." };
  const res = await apiPost(`/api/projects/${projectId}/crm/companies/${companyId}/contacts`, { action, contactIds, overwrite });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, ...res.data };
}
