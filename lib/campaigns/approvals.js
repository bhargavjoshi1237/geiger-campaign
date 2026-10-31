// Campaign approval gate (server-only, service-role db): whether the project's approval policy requires
// sign-off for this campaign and whether it has been granted. The send routes refuse to send or
// schedule when `required && !approved`. Approval holds only for the content that was reviewed
// (lib/campaigns/fingerprint.js), so an edit after sign-off needs a new review.
// OWNER: Campaigns.

import { evaluateApproval } from "./approval_rules";

const MISSING_TABLE = new Set(["42P01", "PGRST205"]);

export async function isCampaignApproved(db, projectId, campaignId) {
  if (!db || !projectId || !campaignId) return { required: false, approved: true };
  const [{ data: policy, error: policyError }, { data: campaign, error: campaignError }] = await Promise.all([
    db.from("approval_policies").select("*").eq("project_id", projectId).is("deleted_at", null).maybeSingle(),
    db.from("campaigns").select("*").eq("project_id", projectId).eq("id", campaignId).is("deleted_at", null).maybeSingle(),
  ]);
  // A missing table means approvals were never set up; any other read failure fails closed.
  if (policyError && MISSING_TABLE.has(policyError.code)) return { required: false, approved: true, state: "not_required" };
  if (policyError) {
    console.error("[campaigns.isCampaignApproved] policy", policyError.message);
    return { required: true, approved: false, state: "unknown", reason: "Couldn't read the approval policy." };
  }
  if (campaignError || !campaign) {
    if (campaignError) console.error("[campaigns.isCampaignApproved] campaign", campaignError.message);
    return { required: !!policy?.required, approved: !policy?.required, state: "unknown" };
  }
  const { data: requests, error: requestError } = await db
    .from("approval_requests")
    .select("*")
    .eq("project_id", projectId)
    .eq("campaign_id", campaignId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (requestError) {
    console.error("[campaigns.isCampaignApproved] requests", requestError.message);
    return { required: !!policy?.required, approved: !policy?.required, state: "unknown" };
  }
  const result = evaluateApproval({ policy, campaign, request: requests?.[0] || null });
  return { required: result.required, approved: result.approved, state: result.state, requestId: result.request?.id ?? null };
}
