// Server-side event recorder (service-role db): every behaviour the platform learns about — form
// submits, opens, clicks, orders, unsubscribes, social interactions — lands in campaign.tracked_events,
// which is also what automation triggers, attribution and activity timelines read. Never throws.

export async function recordEvent(
  db,
  { projectId, contactId = null, anonymousId = null, name, properties = {}, source = "system", deliveryId = null, campaignId = null, revenue = null, currency = null, url = null, referrer = null, utm = {}, occurredAt = null },
) {
  if (!db || !projectId || !name) return null;
  const { data, error } = await db
    .from("tracked_events")
    .insert({
      project_id: projectId,
      contact_id: contactId,
      anonymous_id: anonymousId,
      name: String(name).slice(0, 120),
      properties: properties && typeof properties === "object" ? properties : {},
      source,
      delivery_id: deliveryId,
      campaign_id: campaignId,
      revenue: revenue == null ? null : Number(revenue),
      currency,
      url,
      referrer,
      utm: utm && typeof utm === "object" ? utm : {},
      occurred_at: occurredAt || new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    console.error("[events.record]", error.message);
    return null;
  }
  if (contactId) {
    await db.from("contacts").update({ last_activity_at: new Date().toISOString() }).eq("id", contactId);
  }
  return data.id;
}
