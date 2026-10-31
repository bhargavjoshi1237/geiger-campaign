import { recordEvent } from "@/lib/events/record";
import { verifyToken } from "@/lib/server/tokens";
import { getWorkspaceSettings } from "@/lib/settings/server";
import { emitWebhook } from "@/lib/webhooks/emit";

// Unsubscribe & preference centre (server-only, service-role db) behind the signed /u/<token> link
// every campaign email carries. GET renders state only; changes happen on POST (form or RFC 8058
// one-click), so link scanners can't unsubscribe anyone. Consent changes append contact_consents rows.

const BLOCKED = new Set(["bounced", "complained"]);

function readToken(token) {
  try {
    return verifyToken(token, "unsub");
  } catch {
    return null;
  }
}

async function workspaceInfo(db, projectId) {
  const settings = await getWorkspaceSettings(db, projectId).catch(() => null);
  return {
    name: settings?.branding?.companyName || settings?.general?.name || "",
    logoUrl: settings?.branding?.logoUrl || "",
    address: settings?.branding?.address || "",
  };
}

async function contactLists(db, projectId, contactId, targetedIds) {
  const { data: memberships } = await db
    .from("list_members")
    .select("list_id, status")
    .eq("project_id", projectId)
    .eq("contact_id", contactId)
    .is("deleted_at", null)
    .neq("status", "removed");
  const ids = [...new Set((memberships || []).map((m) => m.list_id))];
  if (!ids.length) return [];
  const { data: lists } = await db.from("lists").select("id, name, description").in("id", ids).is("deleted_at", null);
  const status = new Map((memberships || []).map((m) => [m.list_id, m.status]));
  return (lists || [])
    .map((l) => ({
      id: l.id,
      name: l.name || "Untitled list",
      description: l.description || "",
      subscribed: status.get(l.id) === "subscribed",
      targeted: targetedIds.includes(l.id),
    }))
    .sort((a, b) => Number(b.targeted) - Number(a.targeted) || a.name.localeCompare(b.name));
}

// What the preference page renders: { state: invalid | test | ok, contact, lists, workspace, campaignName }.
export async function loadPreferenceContext(db, token) {
  const payload = readToken(token);
  if (!payload?.p) return { state: "invalid" };
  const workspace = await workspaceInfo(db, payload.p);
  const { data: campaign } = payload.m
    ? await db.from("campaigns").select("id, name, audience").eq("id", payload.m).eq("project_id", payload.p).maybeSingle()
    : { data: null };
  if (payload.t) return { state: "test", workspace, campaignName: campaign?.name || "" };
  if (!payload.c) return { state: "invalid" };
  const { data: contact } = await db
    .from("contacts")
    .select("id, email, first_name, status, unsubscribed_at")
    .eq("id", payload.c)
    .eq("project_id", payload.p)
    .is("deleted_at", null)
    .maybeSingle();
  if (!contact) return { state: "invalid" };
  const lists = await contactLists(db, payload.p, contact.id, campaign?.audience?.listIds || []);
  return {
    state: "ok",
    workspace,
    campaignName: campaign?.name || "",
    contact: { id: contact.id, email: contact.email || "", firstName: contact.first_name || "", status: contact.status },
    lists,
  };
}

async function appendConsent(db, { projectId, contactId, status, source, proof, ip, userAgent }) {
  const { error } = await db.from("contact_consents").insert({
    project_id: projectId,
    contact_id: contactId,
    channel: "email",
    status,
    source,
    proof,
    ip: ip || null,
    user_agent: userAgent ? String(userAgent).slice(0, 500) : null,
    captured_at: new Date().toISOString(),
  });
  if (error) console.error("[campaigns.unsubscribe.consent]", error.message);
}

// action: "all" | "lists" (keepListIds stay subscribed) | "resubscribe". method: one_click | preference_centre.
// Returns { status: unsubscribed | updated | resubscribed | blocked | invalid | test }.
export async function applyPreferenceChange(db, token, { action = "all", keepListIds = [], method = "preference_centre", ip = null, userAgent = null } = {}) {
  const payload = readToken(token);
  if (!payload?.p) return { status: "invalid" };
  if (payload.t) return { status: "test" };
  if (!payload.c) return { status: "invalid" };
  const projectId = payload.p;
  const { data: contact } = await db
    .from("contacts")
    .select("id, email, status")
    .eq("id", payload.c)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!contact) return { status: "invalid" };
  const now = new Date().toISOString();
  const proof = { deliveryId: payload.d || null, campaignId: payload.m || null, method };
  const eventBase = { projectId, contactId: contact.id, source: "email", deliveryId: payload.d || null, campaignId: payload.m || null };

  const { data: memberships } = await db
    .from("list_members")
    .select("id, list_id, status")
    .eq("contact_id", contact.id)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .neq("status", "removed");
  const subscribedLists = (memberships || []).filter((m) => m.status === "subscribed");

  if (action === "resubscribe") {
    if (BLOCKED.has(contact.status)) return { status: "blocked" };
    await db.from("contacts").update({ status: "subscribed", unsubscribed_at: null }).eq("id", contact.id);
    const { data: campaign } = payload.m ? await db.from("campaigns").select("audience").eq("id", payload.m).maybeSingle() : { data: null };
    const restore = (memberships || []).filter((m) => m.status === "unsubscribed" && (campaign?.audience?.listIds || []).includes(m.list_id));
    if (restore.length) await db.from("list_members").update({ status: "subscribed" }).in("id", restore.map((m) => m.id));
    await appendConsent(db, { projectId, contactId: contact.id, status: "opted_in", source: "preference_centre", proof: { ...proof, scope: "resubscribe" }, ip, userAgent });
    await recordEvent(db, { ...eventBase, name: "resubscribed", properties: { method, campaign_id: payload.m || null } });
    return { status: "resubscribed" };
  }

  const keep = new Set((Array.isArray(keepListIds) ? keepListIds : [keepListIds]).filter(Boolean));
  const listOnly = action === "lists" && keep.size > 0;
  const dropped = listOnly ? subscribedLists.filter((m) => !keep.has(m.list_id)) : subscribedLists;
  const rejoined = listOnly ? (memberships || []).filter((m) => m.status === "unsubscribed" && keep.has(m.list_id)) : [];

  if (dropped.length) await db.from("list_members").update({ status: "unsubscribed" }).in("id", dropped.map((m) => m.id));
  if (rejoined.length && !BLOCKED.has(contact.status)) await db.from("list_members").update({ status: "subscribed" }).in("id", rejoined.map((m) => m.id));
  if (listOnly && !dropped.length) return { status: "updated" };

  if (!listOnly) {
    await db
      .from("contacts")
      .update({ ...(BLOCKED.has(contact.status) ? {} : { status: "unsubscribed" }), unsubscribed_at: now })
      .eq("id", contact.id);
    await appendConsent(db, {
      projectId,
      contactId: contact.id,
      status: "opted_out",
      source: method === "one_click" ? "one_click_unsubscribe" : "unsubscribe_link",
      proof: { ...proof, scope: "all" },
      ip,
      userAgent,
    });
  }
  if (payload.d) {
    await db.from("deliveries").update({ unsubscribed_at: now, status: "unsubscribed" }).eq("id", payload.d).is("unsubscribed_at", null);
  }
  const listIds = dropped.map((m) => m.list_id);
  await recordEvent(db, {
    ...eventBase,
    name: "unsubscribed",
    properties: { scope: listOnly ? "lists" : "all", list_ids: listIds, method, campaign_id: payload.m || null, delivery_id: payload.d || null },
  });
  await emitWebhook(db, projectId, "contact.unsubscribed", {
    contactId: contact.id,
    email: contact.email,
    scope: listOnly ? "lists" : "all",
    listIds,
    campaignId: payload.m || null,
    deliveryId: payload.d || null,
    method,
    unsubscribedAt: now,
  });
  return { status: listOnly ? "updated" : "unsubscribed" };
}
