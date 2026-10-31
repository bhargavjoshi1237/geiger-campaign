import { randomUUID } from "node:crypto";
import { recordEvent } from "@/lib/events/record";
import { commissionFor, round2 } from "./ledger";

// Affiliate attribution (server-only, service-role db). /a/<code> counts the click, records an
// `affiliate_click` event, sets a first-party cookie and redirects with UTM + gc_ref. The worker sweep
// then turns `order_completed` events that carry the code (property, cookie, UTM or discount code) —
// or follow a recent click by the same visitor — into affiliate_conversions with their commission.

export const ATTRIBUTION_COOKIE = "gc_aff";
const DAY = 86_400_000;
const ORDER_EVENTS = ["order_completed", "order_placed"];
const REFUND_EVENTS = ["order_refunded", "order_cancelled"];
const CURSOR_JOB = "affiliate_attribution";
const BOT_UA = /bot|crawler|spider|preview|facebookexternalhit|slackbot|whatsapp|telegram|discord|linkedinbot|embedly|curl|wget/i;

const pick = (obj, keys) => {
  for (const key of keys) {
    const value = obj?.[key];
    if (value != null && value !== "") return Array.isArray(value) ? value[0] : value;
  }
  return null;
};

const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

export function isLikelyBot(userAgent) {
  return !userAgent || BOT_UA.test(userAgent);
}

export async function findLinkByCode(db, code) {
  const clean = String(code || "").trim();
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(clean)) return null;
  const { data, error } = await db
    .from("affiliate_links")
    .select("*")
    .ilike("code", clean.replace(/[%_\\]/g, (c) => "\\" + c))
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[creators.attribution.findLink]", error.message);
    return null;
  }
  return data;
}

// The destination with campaign UTM (kept when the URL already has its own) and the gc_ref code.
export function affiliateDestination(link) {
  let url;
  try {
    url = new URL(link.destination_url);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  const utm = {
    utm_source: link.metadata?.utmSource || "creator",
    utm_medium: "affiliate",
    utm_campaign: slug(link.name) || link.code.toLowerCase(),
    utm_content: link.code,
  };
  for (const [key, value] of Object.entries(utm)) if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  url.searchParams.set("gc_ref", link.code);
  return url.toString();
}

// Counts a human click and records it; returns the click id the cookie carries.
export async function recordAffiliateClick(db, { link, request, destination }) {
  const clickId = randomUUID();
  const userAgent = request.headers.get("user-agent") || "";
  if (isLikelyBot(userAgent)) return { clickId, counted: false };
  const incoming = new URL(request.url).searchParams;
  const utm = Object.fromEntries(
    ["source", "medium", "campaign", "content", "term"].map((k) => [k, incoming.get(`utm_${k}`)]).filter(([, v]) => v),
  );
  const [{ error }] = await Promise.all([
    db.rpc("affiliate_link_click", { p_link: link.id }),
    recordEvent(db, {
      projectId: link.project_id,
      anonymousId: clickId,
      name: "affiliate_click",
      source: "web",
      properties: { code: link.code, linkId: link.id, creatorId: link.creator_id, destination, clickId },
      url: request.url,
      referrer: request.headers.get("referer") || null,
      utm,
    }),
  ]);
  if (error) console.error("[creators.attribution.click]", error.message);
  return { clickId, counted: true };
}

// --- Attribution sweep ---------------------------------------------------------------------------

function signalOf(event) {
  const p = event.properties && typeof event.properties === "object" ? event.properties : {};
  const direct = pick(p, ["affiliate_code", "affiliateCode", "gc_ref", "ref", "referral_code", "referralCode"]);
  if (direct) return { code: String(direct), via: "code" };
  const cookie = pick(p, [ATTRIBUTION_COOKIE, "affiliate_cookie", "attribution_cookie"]);
  if (cookie) return { code: String(cookie).split(".")[0], via: "cookie" };
  const utm = event.utm && typeof event.utm === "object" ? event.utm : {};
  if ((utm.medium || utm.utm_medium) === "affiliate") {
    const code = utm.content || utm.utm_content;
    if (code) return { code: String(code), via: "utm" };
  }
  const discount = pick(p, ["coupon_code", "couponCode", "discount_code", "discountCode", "coupon", "discount_codes"]);
  if (discount) return { discount: String(discount).trim().toUpperCase(), via: "discount_code" };
  return null;
}

const orderIdOf = (event) => {
  const p = event.properties && typeof event.properties === "object" ? event.properties : {};
  const id = pick(p, ["order_id", "orderId", "external_id", "order_number", "orderNumber"]);
  return id == null ? null : String(id);
};

const revenueOf = (event) => {
  if (event.revenue != null) return Number(event.revenue) || 0;
  const p = event.properties || {};
  return Number(pick(p, ["total", "revenue", "value", "amount", "subtotal"])) || 0;
};

async function loadCursor(db, now) {
  const { data } = await db.from("creator_worker_cursors").select("*").eq("job", CURSOR_JOB).maybeSingle();
  return data || { job: CURSOR_JOB, cursor_at: new Date(now.getTime() - 30 * DAY).toISOString(), cursor_id: null };
}

async function saveCursor(db, cursor) {
  const { error } = await db
    .from("creator_worker_cursors")
    .upsert({ job: CURSOR_JOB, cursor_at: cursor.cursor_at, cursor_id: cursor.cursor_id, updated_at: new Date().toISOString() }, { onConflict: "job" });
  if (error) console.error("[creators.attribution.cursor]", error.message);
}

// Last click by the same visitor (anonymous id) or contact inside the link's attribution window.
async function loadClicks(db, events) {
  const contactIds = [...new Set(events.map((e) => e.contact_id).filter(Boolean))];
  const anonIds = [...new Set(events.map((e) => e.anonymous_id).filter(Boolean))];
  if (!contactIds.length && !anonIds.length) return [];
  const filters = [
    contactIds.length ? `contact_id.in.(${contactIds.join(",")})` : null,
    anonIds.length ? `anonymous_id.in.(${anonIds.map((a) => `"${String(a).replace(/"/g, "")}"`).join(",")})` : null,
  ].filter(Boolean);
  const { data } = await db
    .from("tracked_events")
    .select("contact_id, anonymous_id, properties, occurred_at, project_id")
    .eq("name", "affiliate_click")
    .in("project_id", [...new Set(events.map((e) => e.project_id))])
    .or(filters.join(","))
    .gte("occurred_at", new Date(Date.now() - 365 * DAY).toISOString())
    .order("occurred_at", { ascending: false })
    .limit(2000);
  return data || [];
}

export function matchConversion(event, { byCode, byDiscount, linksById, clicks }) {
  const signal = signalOf(event);
  if (signal?.code) {
    const link = byCode.get(signal.code.toLowerCase());
    if (link && link.project_id === event.project_id) return { link, via: signal.via };
  }
  if (signal?.discount) {
    const link = byDiscount.get(`${event.project_id}|${signal.discount}`);
    if (link) return { link, via: "discount_code" };
  }
  const at = Date.parse(event.occurred_at);
  for (const click of clicks) {
    if (click.project_id !== event.project_id) continue;
    const sameVisitor =
      (event.contact_id && click.contact_id === event.contact_id) || (event.anonymous_id && click.anonymous_id === event.anonymous_id);
    if (!sameVisitor) continue;
    const link = linksById.get(click.properties?.linkId);
    const clickedAt = Date.parse(click.occurred_at);
    if (link && clickedAt <= at && at - clickedAt <= (link.attribution_window_days || 30) * DAY) return { link, via: "click" };
  }
  return null;
}

// Recomputes conversions / revenue / commission on the given links from their conversion rows.
export async function recomputeLinkRollups(db, linkIds) {
  const ids = [...new Set(linkIds)].filter(Boolean);
  if (!ids.length) return;
  const { data } = await db
    .from("affiliate_conversions")
    .select("affiliate_link_id, revenue, commission, status")
    .in("affiliate_link_id", ids)
    .is("deleted_at", null)
    .neq("status", "rejected");
  const totals = new Map(ids.map((id) => [id, { conversions: 0, revenue: 0, commission_earned: 0 }]));
  for (const row of data || []) {
    const t = totals.get(row.affiliate_link_id);
    t.conversions += 1;
    t.revenue = round2(t.revenue + Number(row.revenue || 0));
    t.commission_earned = round2(t.commission_earned + Number(row.commission || 0));
  }
  await Promise.all([...totals].map(([id, t]) => db.from("affiliate_links").update(t).eq("id", id)));
}

export async function sweepAffiliateAttribution(db, { now = new Date(), deadline = Infinity, limit = 500 } = {}) {
  const { data: links, error } = await db.from("affiliate_links").select("*").is("deleted_at", null).limit(5000);
  if (error) {
    console.error("[creators.attribution.links]", error.message);
    return { error: "load_failed" };
  }
  const cursor = await loadCursor(db, now);
  if (!links?.length) {
    await saveCursor(db, { cursor_at: now.toISOString(), cursor_id: null });
    return { scanned: 0, attributed: 0 };
  }

  const active = links.filter((l) => l.status === "active");
  const byCode = new Map(active.map((l) => [l.code.toLowerCase(), l]));
  const byDiscount = new Map(active.filter((l) => l.discount_code).map((l) => [`${l.project_id}|${l.discount_code.toUpperCase()}`, l]));
  const linksById = new Map(active.map((l) => [l.id, l]));
  const projectIds = [...new Set(links.map((l) => l.project_id))];

  const { data: batch, error: eventsError } = await db
    .from("tracked_events")
    .select("id, project_id, contact_id, anonymous_id, name, properties, revenue, currency, utm, occurred_at, created_at")
    .in("project_id", projectIds)
    .in("name", [...ORDER_EVENTS, ...REFUND_EVENTS])
    .gte("created_at", cursor.cursor_at)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit);
  if (eventsError) {
    console.error("[creators.attribution.events]", eventsError.message);
    return { error: "events_failed" };
  }
  const events = (batch || []).filter((e) => !(e.created_at === cursor.cursor_at && cursor.cursor_id && e.id <= cursor.cursor_id));

  const orders = events.filter((e) => ORDER_EVENTS.includes(e.name));
  const refunds = events.filter((e) => REFUND_EVENTS.includes(e.name));
  const clicks = orders.length ? await loadClicks(db, orders) : [];
  const touched = [];
  const summary = { scanned: events.length, attributed: 0, rejected: 0 };

  for (const event of orders) {
    if (Date.now() > deadline) break;
    const match = matchConversion(event, { byCode, byDiscount, linksById, clicks });
    if (!match) continue;
    const { link, via } = match;
    const revenue = round2(revenueOf(event));
    const { error: insertError } = await db.from("affiliate_conversions").insert({
      project_id: event.project_id,
      affiliate_link_id: link.id,
      creator_id: link.creator_id,
      tracked_event_id: event.id,
      contact_id: event.contact_id,
      order_external_id: orderIdOf(event),
      revenue,
      commission: commissionFor(link.commission, revenue),
      currency: event.currency || event.properties?.currency || link.currency || "USD",
      attributed_via: via,
      status: "pending",
      occurred_at: event.occurred_at,
      metadata: { code: link.code },
    });
    if (insertError && insertError.code !== "23505") console.error("[creators.attribution.insert]", insertError.message);
    if (!insertError) {
      summary.attributed += 1;
      touched.push(link.id);
    }
  }

  for (const event of refunds) {
    const orderId = orderIdOf(event);
    if (!orderId) continue;
    const { data: rows } = await db
      .from("affiliate_conversions")
      .select("id, affiliate_link_id, metadata")
      .eq("project_id", event.project_id)
      .eq("order_external_id", orderId)
      .in("status", ["pending", "approved"])
      .is("payout_id", null);
    for (const row of rows || []) {
      const metadata = { ...(row.metadata || {}), rejectedReason: event.name, rejectedAt: now.toISOString() };
      const { error: rejectError } = await db.from("affiliate_conversions").update({ status: "rejected", metadata }).eq("id", row.id);
      if (rejectError) continue;
      summary.rejected += 1;
      touched.push(row.affiliate_link_id);
    }
  }

  await recomputeLinkRollups(db, touched);
  const last = events[events.length - 1] || batch?.[batch.length - 1];
  if (last) await saveCursor(db, { cursor_at: last.created_at, cursor_id: last.id });
  summary.approved = await autoApproveConversions(db, { now, links: linksById });
  return summary;
}

// Pending conversions past their link's hold period (commission.holdDays > 0) are approved.
export async function autoApproveConversions(db, { now = new Date(), links }) {
  const holding = [...links.values()].filter((l) => Number(l.commission?.holdDays) > 0);
  if (!holding.length) return 0;
  const { data: pending } = await db
    .from("affiliate_conversions")
    .select("id, affiliate_link_id, occurred_at")
    .in("affiliate_link_id", holding.map((l) => l.id))
    .eq("status", "pending")
    .is("payout_id", null)
    .is("deleted_at", null)
    .limit(1000);
  const due = (pending || []).filter((c) => {
    const link = links.get(c.affiliate_link_id);
    return link && Date.parse(c.occurred_at) <= now.getTime() - Number(link.commission.holdDays) * DAY;
  });
  if (!due.length) return 0;
  const { error } = await db
    .from("affiliate_conversions")
    .update({ status: "approved", approved_at: now.toISOString() })
    .in("id", due.map((c) => c.id))
    .eq("status", "pending");
  if (error) {
    console.error("[creators.attribution.approve]", error.message);
    return 0;
  }
  return due.length;
}
