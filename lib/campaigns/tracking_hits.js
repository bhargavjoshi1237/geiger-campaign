import { recordEvent } from "@/lib/events/record";
import { getWorkspaceSettings } from "@/lib/settings/server";
import { emitWebhook } from "@/lib/webhooks/emit";

// Open/click bookkeeping for the tracking routes (server-only, service-role db): delivery counters and
// status progression (campaign.track_delivery, atomic), a tracked event per hit for timelines,
// attribution and automation triggers, and the email.opened / email.clicked webhooks.
// Workspaces that turned tracking off record nothing. Never throws.

const MAX_RECORDED_OPENS = 50;
// Link scanners and prefetchers that "click" every link before a person does.
const MACHINE_CLICK = /(barracuda|mimecast|proofpoint|bitdefender|sophos|safebrowsing|urlscan|\bbot\b|crawler|spider|headless|python-requests|curl\/)/i;

async function loadDelivery(db, deliveryId) {
  const { data } = await db
    .from("deliveries")
    .select("id, project_id, contact_id, campaign_id, source_type, source_id, variant, status, open_count, opened_at, clicked_at")
    .eq("id", deliveryId)
    .maybeSingle();
  return data || null;
}

// Atomic RPC; falls back to a plain update if the migration's function isn't there yet.
async function track(db, delivery, kind) {
  const { data, error } = await db.rpc("track_delivery", { p_delivery_id: delivery.id, p_kind: kind });
  if (!error && data) return data;
  if (error) console.error("[campaigns.tracking.rpc]", error.message);
  const now = new Date().toISOString();
  const firstOpen = !delivery.opened_at;
  const firstClick = kind === "click" && !delivery.clicked_at;
  const terminal = ["bounced", "complained", "unsubscribed", "failed", "not_sent", "replied"].includes(delivery.status);
  const patch = {
    opened_at: delivery.opened_at || now,
    open_count: (Number(delivery.open_count) || 0) + (kind === "open" || firstOpen ? 1 : 0),
    ...(terminal ? {} : { status: kind === "click" ? "clicked" : delivery.status === "clicked" ? "clicked" : "opened" }),
  };
  if (kind === "click") {
    const { data: row } = await db.from("deliveries").select("click_count").eq("id", delivery.id).maybeSingle();
    patch.click_count = (Number(row?.click_count) || 0) + 1;
    patch.clicked_at = delivery.clicked_at || now;
  }
  await db.from("deliveries").update(patch).eq("id", delivery.id);
  return { ...delivery, first_open: firstOpen, first_click: firstClick, open_count: patch.open_count };
}

async function trackingEnabled(db, projectId, kind) {
  try {
    const settings = await getWorkspaceSettings(db, projectId);
    return kind === "open" ? settings.tracking?.opens !== false : settings.tracking?.clicks !== false;
  } catch {
    return true;
  }
}

const baseEvent = (delivery, meta) => ({
  projectId: delivery.project_id,
  contactId: delivery.contact_id,
  source: "email",
  deliveryId: delivery.id,
  campaignId: delivery.campaign_id,
  properties: {
    campaign_id: delivery.campaign_id,
    delivery_id: delivery.id,
    source_type: delivery.source_type,
    source_id: delivery.source_id,
    variant: delivery.variant,
    user_agent: meta.userAgent || null,
  },
});

export async function recordOpen(db, deliveryId, meta = {}) {
  try {
    const delivery = db && deliveryId ? await loadDelivery(db, deliveryId) : null;
    if (!delivery || delivery.source_type === "test") return false;
    if (!(await trackingEnabled(db, delivery.project_id, "open"))) return false;
    const result = await track(db, delivery, "open");
    if ((Number(result?.open_count) || 0) <= MAX_RECORDED_OPENS) {
      const event = baseEvent(delivery, meta);
      await recordEvent(db, { ...event, name: "email_opened", properties: { ...event.properties, first: !!result?.first_open } });
    }
    if (result?.first_open) {
      await emitWebhook(db, delivery.project_id, "email.opened", {
        deliveryId: delivery.id,
        campaignId: delivery.campaign_id,
        contactId: delivery.contact_id,
        variant: delivery.variant,
        openedAt: new Date().toISOString(),
      });
    }
    return true;
  } catch (error) {
    console.error("[campaigns.tracking.open]", error);
    return false;
  }
}

export async function recordClick(db, deliveryId, { url, destination = url, ...meta } = {}) {
  try {
    if (MACHINE_CLICK.test(meta.userAgent || "")) return false;
    const delivery = db && deliveryId ? await loadDelivery(db, deliveryId) : null;
    if (!delivery || delivery.source_type === "test") return false;
    if (!(await trackingEnabled(db, delivery.project_id, "click"))) return false;
    const result = await track(db, delivery, "click");
    const event = baseEvent(delivery, meta);
    if (result?.first_open) {
      await recordEvent(db, { ...event, name: "email_opened", properties: { ...event.properties, first: true, implied: true } });
    }
    await recordEvent(db, {
      ...event,
      name: "email_clicked",
      url: destination,
      properties: { ...event.properties, url, first: !!result?.first_click },
    });
    await emitWebhook(db, delivery.project_id, "email.clicked", {
      deliveryId: delivery.id,
      campaignId: delivery.campaign_id,
      contactId: delivery.contact_id,
      variant: delivery.variant,
      url,
      clickedAt: new Date().toISOString(),
    });
    return true;
  } catch (error) {
    console.error("[campaigns.tracking.click]", error);
    return false;
  }
}
