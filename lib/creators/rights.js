import { dispatch } from "@/lib/messaging/dispatch";
import { isEmailConfigured } from "@/lib/email/client";
import { publicUrl } from "@/lib/server/urls";
import { isSigningConfigured, signToken, verifyToken } from "@/lib/server/tokens";
import { ApiError, badRequest, notConfigured, notFound } from "@/lib/server/http";
import { buildCreatorEmail, creatorEmailContext, creatorMergeData, senderAddress } from "./email";
import { USAGE_LABELS } from "./labels";

// UGC usage rights (server-only). A request emails the creator a signed link to a page where they
// approve or decline the stated use (channels, term, whitelisting); the decision is stored on the item
// with its proof (time, IP, user agent). The worker expires grants whose term has ended.

const DAY = 86_400_000;

const describeUse = ({ channels = [], termDays = 0, whitelisting = false }) => {
  const where = channels.length ? channels.map((c) => USAGE_LABELS[c] || c).join(", ") : "our marketing channels";
  const term = Number(termDays) > 0 ? `for ${termDays} days` : "with no end date";
  return `${where}, ${term}${whitelisting ? ", including paid ads run from your handle (whitelisting)" : ""}`;
};

export async function requestUgcRights(db, { projectId, ugcId, termDays = 90, channels = null, whitelisting = null, message = "" }) {
  if (!isSigningConfigured()) throw notConfigured("Link signing isn't configured (CAMPAIGN_SIGNING_SECRET), so rights links can't be issued.");
  if (!isEmailConfigured()) throw notConfigured("Email delivery isn't configured (GEIGER_EMAIL_API_KEY), so the request can't be sent.");

  const { data: item } = await db.from("ugc_items").select("*").eq("project_id", projectId).eq("id", ugcId).is("deleted_at", null).maybeSingle();
  if (!item) throw notFound("Content not found.");
  if (!item.creator_id) throw badRequest("Link this content to a creator with an email address first.");
  const { data: creator } = await db.from("creators").select("id, name, email, handles, contact_id").eq("id", item.creator_id).maybeSingle();
  if (!creator?.email) throw badRequest("This creator has no email address.");

  const request = {
    termDays: Math.max(0, Math.round(Number(termDays) || 0)),
    channels: Array.isArray(channels) ? channels : item.usage_channels || [],
    whitelisting: whitelisting == null ? Boolean(item.whitelisting) : Boolean(whitelisting),
  };
  const count = Number(item.metadata?.rightsRequest?.count || 0) + 1;
  const token = signToken({ k: "ugc_rights", u: item.id }, { ttlDays: 30 });
  const url = publicUrl(`/api/projects/${projectId}/creators/ugc/rights`, { t: token });
  const { settings, brandName } = await creatorEmailContext(db, projectId);
  const what = item.title || (item.kind ? `your ${item.kind}` : "your content");

  const email = buildCreatorEmail({
    subject: `${brandName || "We"} would love to share ${what}`,
    body: [
      "Hi {{first_name|there}},",
      message.trim(),
      `We'd like your permission to use ${what}${item.source_url ? ` (${item.source_url})` : ""} on ${describeUse(request)}. We'll always credit you.`,
      `Approve or decline here: ${url}`,
      `Thanks,\n${brandName || "The team"}`,
    ].filter(Boolean).join("\n\n"),
    mergeData: creatorMergeData(creator, { brand_name: brandName }),
    brand: settings?.branding || {},
  });
  const result = await dispatch({
    db,
    projectId,
    channel: "email",
    to: creator.email,
    contactId: creator.contact_id || null,
    source: { type: "creator_rights", id: item.id },
    idempotencyKey: `creator-rights:${item.id}:${count}`,
    message: { ...email, from: senderAddress({}, settings), label: "campaign.creator_rights" },
    metadata: { creatorId: creator.id, ugcId: item.id },
  });
  if (result.status === "not_sent") throw notConfigured(result.error || "Email couldn't be sent.");
  if (result.status === "failed") throw new ApiError(502, result.error || "The email couldn't be sent.", "send_failed");

  const now = new Date().toISOString();
  const metadata = { ...(item.metadata || {}), rightsRequest: { ...request, count, sentAt: now, deliveryId: result.deliveryId } };
  const { data: updated, error } = await db
    .from("ugc_items")
    .update({ rights_status: "requested", rights_requested_at: now, usage_channels: request.channels, whitelisting: request.whitelisting, metadata })
    .eq("id", item.id)
    .select("*")
    .single();
  if (error) throw new ApiError(500, "The email went out but the request couldn't be recorded.");
  return { item: updated };
}

// The item a rights link points at, with what was asked and the brand asking.
export async function loadRightsRequest(db, projectId, token) {
  const payload = verifyToken(token, "ugc_rights");
  if (!payload?.u) return null;
  const { data: item } = await db.from("ugc_items").select("*").eq("id", payload.u).eq("project_id", projectId).is("deleted_at", null).maybeSingle();
  if (!item) return null;
  const { brandName } = await creatorEmailContext(db, projectId);
  const request = item.metadata?.rightsRequest || { termDays: 0, channels: item.usage_channels || [], whitelisting: item.whitelisting };
  return { item, brandName, request, use: describeUse(request) };
}

export async function decideRights(db, projectId, token, { decision, ip = null, userAgent = null, now = new Date() }) {
  const found = await loadRightsRequest(db, projectId, token);
  if (!found) return null;
  const { item, request } = found;
  if (item.rights_status !== "requested") return { ...found, already: true };
  const granted = decision === "grant";
  const at = now.toISOString();
  const termDays = Number(request.termDays) || 0;
  const patch = {
    rights_status: granted ? "granted" : "denied",
    rights_granted_at: granted ? at : null,
    rights_expires_at: granted && termDays > 0 ? new Date(now.getTime() + termDays * DAY).toISOString() : null,
    metadata: { ...(item.metadata || {}), rightsProof: { decision: granted ? "granted" : "denied", at, ip, userAgent, use: found.use } },
  };
  const { data: updated, error } = await db.from("ugc_items").update(patch).eq("id", item.id).eq("rights_status", "requested").select("*").maybeSingle();
  if (error) {
    console.error("[creators.rights.decide]", error.message);
    return null;
  }
  return { ...found, item: updated || item, already: !updated };
}

// Grants past their end date become expired (worker).
export async function expireUgcRights(db, { now = new Date() } = {}) {
  const { data, error } = await db
    .from("ugc_items")
    .update({ rights_status: "expired" })
    .eq("rights_status", "granted")
    .lt("rights_expires_at", now.toISOString())
    .is("deleted_at", null)
    .select("id");
  if (error) {
    console.error("[creators.rights.expire]", error.message);
    return 0;
  }
  return (data || []).length;
}
