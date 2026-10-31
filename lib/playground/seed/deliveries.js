// Delivery engine seed: the send history of Halcyon's eight sent campaigns (campaigns n=1..8) to the
// seeded audience (contacts n=1..48) — one delivery per recipient with opens, clicks, bounces and
// unsubscribes timed around each contact's habits, the matching tracked events (opens, clicks and
// attributed orders), the completed send jobs and the workspace's send-time defaults.
//
// Pass the seeded contacts/campaigns rows to line addresses, time zones and subjects up with them:
//   deliveriesSeed({ contacts: audience.contacts, campaigns: campaigns.campaigns })
// Without them the seed falls back to stable placeholder addresses and subjects.

import { PLAYGROUND_PERSON } from "../cast.js";
import { PROJECT_ID, between, daysAgo, noise, pick, seedIds, weighted } from "./helpers.js";
import { zoneOffsetHours } from "../../campaigns/send_time.js";

// Delivery engine code block 400-499; deliveries n=1..9999, tracked_events n=1..4999.
const aid = seedIds({ send: 400, send_time_setting: 401 });

const HOUR = 3_600_000;
const MINUTE = 60_000;
const CONTACTS = 48;
const LATEST = Date.now() - 5 * MINUTE;

// Who left and who bounced, and on which campaign (Audience should mirror these statuses).
const UNSUBSCRIBES = { 13: 3, 29: 6, 41: 7 };
const BOUNCES = { 22: 1, 37: 4 };
const COMPLAINTS = { 44: 5 };

// Per-campaign send shape: strategy and how clicky the content is.
const CAMPAIGNS = {
  1: { strategy: "now", clickRate: 0.1, subject: "Halcyon notes: what we learned shipping Atlas" },
  2: { strategy: "now", clickRate: 0.11, subject: "The Kestrel Aero brand film is live" },
  3: { strategy: "timezone", clickRate: 0.13, subject: "Your seat at the Halcyon Creative Summit" },
  4: { strategy: "now", clickRate: 0.09, subject: "Solace Summer '26 lookbook" },
  5: { strategy: "optimized", clickRate: 0.12, subject: "Five campaign ideas for Q4" },
  6: { strategy: "now", clickRate: 0.08, subject: "Atlas Coffee: the new café experience" },
  7: { strategy: "now", clickRate: 0.14, subject: "Kestrel Aero pre-orders are open" },
  8: { strategy: "now", clickRate: 0.12, subject: "Last call: Summit early-bird pricing", ab: true },
};

const LINKS = {
  1: ["https://halcyon.studio/work/atlas-rebrand", "https://halcyon.studio/journal/packaging-systems", "https://halcyon.studio/contact"],
  2: ["https://halcyon.studio/work/kestrel-aero", "https://kestrelbikes.example/aero", "https://halcyon.studio/journal/behind-the-film"],
  3: ["https://halcyon.studio/summit/register", "https://halcyon.studio/summit/speakers", "https://halcyon.studio/summit/venue"],
  4: ["https://solacehotels.example/summer", "https://halcyon.studio/work/solace-summer", "https://solacehotels.example/book"],
  5: ["https://halcyon.studio/journal/q4-campaign-ideas", "https://halcyon.studio/services/campaigns", "https://halcyon.studio/contact"],
  6: ["https://atlascoffee.example/cafes", "https://halcyon.studio/work/atlas-cafes", "https://atlascoffee.example/shop"],
  7: ["https://kestrelbikes.example/aero/preorder", "https://kestrelbikes.example/aero/specs", "https://halcyon.studio/work/kestrel-aero"],
  8: ["https://halcyon.studio/summit/register", "https://halcyon.studio/summit/agenda", "https://halcyon.studio/summit/faq"],
};

const ZONES = ["Europe/Lisbon", "America/New_York", "Europe/London", "Europe/Berlin", "Europe/Amsterdam", "Europe/Madrid", "America/Chicago"];
const PREFERRED_HOURS = [
  [[7, 8, 9], 35],
  [[12, 13], 25],
  [[17, 18], 15],
  [[20, 21, 22], 25],
];

const iso = (ms) => new Date(Math.min(ms, LATEST)).toISOString();
const hex = (n, length = 24) => {
  let out = "";
  for (let i = 0; out.length < length; i += 1) out += Math.floor(noise(n * 31 + i) * 16).toString(16);
  return out;
};

function campaignSentAt(n, campaigns) {
  const row = campaigns?.find((c) => c.id === aid("campaign", n));
  return Date.parse(row?.sent_at || "") || Date.parse(daysAgo(4 + (8 - n) * 6));
}

function contactProfile(c, contacts) {
  const row = contacts?.find((r) => r.id === aid("contact", c));
  const tier = noise(c * 7.3);
  const engagement = tier < 0.3 ? 0.72 : tier < 0.75 ? 0.42 : 0.12;
  const hours = weighted(c * 13, PREFERRED_HOURS);
  return {
    id: aid("contact", c),
    email: row?.email || `contact${c}@halcyon-audience.example`,
    hasEmail: row ? Boolean(row.email) : true,
    zone: row?.timezone || pick(ZONES, c * 5),
    engagement,
    hour: pick(hours, c * 17),
  };
}

// The next instant after `from` when the contact's local clock reads `hour` (approximate offset).
function nextLocalHour(from, hour, zone, minute = 0) {
  const offset = zoneOffsetHours(zone, new Date(from));
  const day = new Date(from);
  day.setUTCHours(0, 0, 0, 0);
  let at = day.getTime() + (hour - offset) * HOUR + minute * MINUTE;
  while (at <= from) at += 24 * HOUR;
  return at;
}

export function deliveriesSeed({ contacts = null, campaigns = null } = {}) {
  const deliveries = [];
  const events = [];
  const sends = [];
  const left = new Set();
  let d = 0;
  let e = 0;

  const event = (fields) => {
    e += 1;
    const at = iso(fields.at);
    events.push({
      id: aid("tracked_event", e),
      project_id: PROJECT_ID,
      contact_id: fields.contactId,
      anonymous_id: null,
      name: fields.name,
      properties: fields.properties || {},
      source: fields.source || "email",
      delivery_id: fields.deliveryId,
      campaign_id: fields.campaignId,
      revenue: fields.revenue ?? null,
      currency: fields.revenue != null ? "USD" : null,
      url: fields.url || null,
      referrer: null,
      utm: fields.utm || {},
      occurred_at: at,
      metadata: {},
      created_at: at,
      updated_at: at,
      deleted_at: null,
    });
  };

  for (let n = 1; n <= 8; n += 1) {
    const shape = CAMPAIGNS[n];
    const campaignId = aid("campaign", n);
    const sentAt = campaignSentAt(n, campaigns);
    const subjectRow = campaigns?.find((c) => c.id === campaignId);
    const subject = subjectRow?.subject || shape.subject;
    const totals = { total: 0, sent: 0, failed: 0 };
    let lastSend = sentAt;

    for (let c = 1; c <= CONTACTS; c += 1) {
      const p = contactProfile(c, contacts);
      const leavesHere = UNSUBSCRIBES[c] === n || BOUNCES[c] === n || COMPLAINTS[c] === n;
      if (left.has(c) || !p.hasEmail || (!leavesHere && noise(n * 101 + c) > 0.86)) continue;
      d += 1;
      const seed = n * 1000 + c;
      const deliveryId = aid("delivery", d);
      const variant = shape.ab ? (noise(seed * 3) < 0.5 ? "A" : "B") : null;

      let sent = sentAt + between(seed, 2, 90) * 1000;
      if (shape.strategy === "timezone") sent = nextLocalHour(sentAt, 9, p.zone, between(seed, 0, 20));
      if (shape.strategy === "optimized") sent = nextLocalHour(sentAt, p.hour, p.zone, between(seed, 0, 45));
      lastSend = Math.max(lastSend, sent);

      const row = {
        id: deliveryId,
        project_id: PROJECT_ID,
        channel: "email",
        status: "sent",
        contact_id: p.id,
        to_address: p.email,
        source_type: "campaign",
        source_id: campaignId,
        campaign_id: campaignId,
        variant,
        subject,
        provider: "geiger_email",
        provider_id: `re_${hex(seed)}`,
        connection_id: null,
        error: null,
        cost: 0,
        currency: "USD",
        open_count: 0,
        click_count: 0,
        idempotency_key: `campaign:${campaignId}:${p.id}`,
        sent_at: iso(sent),
        delivered_at: null,
        opened_at: null,
        clicked_at: null,
        bounced_at: null,
        unsubscribed_at: null,
        metadata: { sendId: aid("send", n) },
        created_by: null,
        created_at: iso(sent - 1000),
        updated_at: iso(sent),
        deleted_at: null,
      };
      totals.total += 1;
      totals.sent += 1;

      if (BOUNCES[c] === n) {
        Object.assign(row, {
          status: "bounced",
          bounced_at: iso(sent + 40_000),
          error: "550 5.1.1 The email account that you tried to reach does not exist.",
          updated_at: iso(sent + 40_000),
        });
        left.add(c);
        deliveries.push(row);
        continue;
      }

      let openChance = p.engagement * (variant === "B" ? 1.18 : 1) * (shape.strategy === "optimized" ? 1.12 : 1);
      if (UNSUBSCRIBES[c] === n || COMPLAINTS[c] === n) openChance = 1;
      if (noise(seed * 7) < openChance) {
        const immediate = noise(seed * 11) < (shape.strategy === "optimized" ? 0.7 : 0.4);
        const firstOpen = immediate
          ? sent + between(seed * 13, 4, 150) * MINUTE
          : nextLocalHour(sent + HOUR, p.hour, p.zone, between(seed * 17, 0, 55));
        const extraOpens = p.engagement > 0.5 ? between(seed * 19, 0, 2) : between(seed * 19, 0, 1);
        const opens = [firstOpen, ...Array.from({ length: extraOpens }, (_, i) => firstOpen + between(seed * 23 + i, 2, 52) * HOUR)].filter((t) => t < LATEST);
        if (opens.length) {
          row.status = "opened";
          row.opened_at = iso(opens[0]);
          row.open_count = opens.length;
          row.updated_at = iso(opens[opens.length - 1]);
          opens.forEach((t, i) =>
            event({
              name: "email_opened",
              at: t,
              contactId: p.id,
              deliveryId,
              campaignId,
              properties: { campaign_id: campaignId, delivery_id: deliveryId, source_type: "campaign", source_id: campaignId, variant, first: i === 0 },
            }),
          );

          if (noise(seed * 29) < shape.clickRate * (p.engagement > 0.5 ? 1.5 : 1)) {
            const clicks = 1 + (noise(seed * 31) < 0.3 ? 1 : 0);
            for (let k = 0; k < clicks; k += 1) {
              const at = opens[0] + between(seed * 37 + k, 1, 25) * MINUTE + k * 3 * MINUTE;
              if (at >= LATEST) continue;
              const url = pick(LINKS[n], seed * 41 + k);
              row.click_count += 1;
              row.clicked_at = row.clicked_at || iso(at);
              row.status = "clicked";
              row.updated_at = iso(Math.max(Date.parse(row.updated_at), at));
              event({
                name: "email_clicked",
                at,
                contactId: p.id,
                deliveryId,
                campaignId,
                url,
                properties: { campaign_id: campaignId, delivery_id: deliveryId, source_type: "campaign", source_id: campaignId, variant, url, first: k === 0 },
              });
            }
            if (row.clicked_at && noise(seed * 43) < 0.35) {
              const at = Date.parse(row.clicked_at) + between(seed * 47, 6, 95) * MINUTE;
              const revenue = between(seed * 53, 38, 420) + between(seed * 59, 0, 99) / 100;
              event({
                name: "order_completed",
                source: "commerce",
                at,
                contactId: p.id,
                deliveryId,
                campaignId,
                revenue,
                properties: { order_number: `HAL-${10400 + d}`, items: between(seed * 61, 1, 4), value: revenue, attribution: "email_click" },
              });
            }
          }
        }
      }

      if (UNSUBSCRIBES[c] === n || COMPLAINTS[c] === n) {
        const at = Date.parse(row.opened_at || row.sent_at) + between(seed * 67, 2, 40) * MINUTE;
        const complaint = COMPLAINTS[c] === n;
        row.status = complaint ? "complained" : "unsubscribed";
        row.unsubscribed_at = iso(at);
        row.updated_at = iso(at);
        left.add(c);
        if (!complaint) {
          event({
            name: "unsubscribed",
            at,
            contactId: p.id,
            deliveryId,
            campaignId,
            properties: { scope: "all", list_ids: [], method: "preference_centre", campaign_id: campaignId, delivery_id: deliveryId },
          });
        }
      }
      deliveries.push(row);
    }

    const ab = shape.ab
      ? { enabled: true, phase: "decided", testPercent: 100, metric: "opens", durationHours: 4, variants: ["A", "B"], winner: "B", decidedAt: iso(sentAt + 4 * HOUR) }
      : {};
    sends.push({
      id: aid("send", n),
      project_id: PROJECT_ID,
      campaign_id: campaignId,
      channel: "email",
      status: "completed",
      strategy: { mode: shape.strategy, windowHours: 24, fallbackHour: 10, minOpens: 2, localTime: "09:00" },
      ab,
      total: totals.total,
      sent: totals.sent,
      failed: totals.failed,
      skipped: 0,
      uncertain: 0,
      scheduled_for: null,
      started_at: iso(sentAt),
      completed_at: iso(lastSend + 2 * MINUTE),
      throttled_until: null,
      lease_until: null,
      last_tick_at: iso(lastSend + 2 * MINUTE),
      error: null,
      metadata: {},
      created_by: PLAYGROUND_PERSON.id,
      created_at: iso(sentAt - 30_000),
      updated_at: iso(lastSend + 2 * MINUTE),
      deleted_at: null,
    });
  }

  const settingsAt = daysAgo(40);
  return {
    deliveries,
    tracked_events: events,
    campaign_sends: sends,
    send_time_settings: [
      {
        id: aid("send_time_setting", 1),
        project_id: PROJECT_ID,
        enabled: true,
        strategy: "optimized",
        fallback_hour: 10,
        window_hours: 24,
        min_opens: 2,
        local_time: "09:00",
        metadata: {},
        created_by: PLAYGROUND_PERSON.id,
        created_at: settingsAt,
        updated_at: settingsAt,
        deleted_at: null,
      },
    ],
  };
}
