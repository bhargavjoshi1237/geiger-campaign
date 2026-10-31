// Revenue attribution: conversion events (tracked_events) credited to the message touches (deliveries)
// that preceded them for the same contact. Pure; models are last click, first touch and linear.

import { deliveryFlags, sendTime } from "./aggregate";
import { DAY, inWindow, toTime } from "./ranges";

export const ATTRIBUTION_MODELS = [
  { value: "last_click", label: "Last click", description: "All credit to the most recent click (or open, if allowed) before the conversion." },
  { value: "first_touch", label: "First touch", description: "All credit to the earliest touch inside the window." },
  { value: "linear", label: "Linear", description: "Credit split evenly across every touch inside the window." },
];

export const WINDOW_OPTIONS = [1, 3, 7, 14, 30];

export const TOUCH_OPTIONS = [
  { value: "click", label: "Clicks only" },
  { value: "engaged", label: "Clicks and opens" },
];

export const DEFAULT_CONVERSION_EVENTS = ["order_completed", "deal_won"];

export const DEFAULT_ATTRIBUTION = Object.freeze({
  model: "last_click",
  windowDays: 7,
  touch: "engaged",
  events: DEFAULT_CONVERSION_EVENTS,
  includeRevenueEvents: true,
});

export function normalizeAttribution(cfg = {}) {
  return {
    model: ATTRIBUTION_MODELS.some((m) => m.value === cfg.model) ? cfg.model : DEFAULT_ATTRIBUTION.model,
    windowDays: WINDOW_OPTIONS.includes(Number(cfg.windowDays)) ? Number(cfg.windowDays) : DEFAULT_ATTRIBUTION.windowDays,
    touch: cfg.touch === "click" ? "click" : "engaged",
    events: Array.isArray(cfg.events) ? cfg.events.filter(Boolean) : DEFAULT_ATTRIBUTION.events,
    includeRevenueEvents: cfg.includeRevenueEvents !== false,
  };
}

export function isConversionEvent(e, cfg = DEFAULT_ATTRIBUTION) {
  return cfg.events.includes(e.name) || (cfg.includeRevenueEvents && Number(e.revenue) > 0);
}

export function conversionEvents(events, cfg, { start, end } = {}) {
  return (events || []).filter((e) => isConversionEvent(e, cfg) && (!start || !end || inWindow(e.occurredAt, start, end)));
}

// Where a conversion came from: UTM source, then referrer host, then the ingest source.
export function eventSource(e) {
  const utm = e.utm || {};
  const raw = utm.source || utm.utm_source || e.properties?.utm_source;
  if (raw) return String(raw).toLowerCase();
  if (e.referrer) {
    try {
      return new URL(e.referrer).hostname.replace(/^www\./, "");
    } catch {
      // fall through to the ingest source
    }
  }
  return e.source || "direct";
}

// contactId -> touches sorted by time. A click is a touch; an open counts only when `touch` allows it.
export function buildTouches(deliveries, { touch = "engaged" } = {}) {
  const map = new Map();
  for (const d of deliveries || []) {
    if (!d.contactId) continue;
    const f = deliveryFlags(d);
    let kind = null;
    let at = null;
    if (f.clicked) {
      kind = "click";
      at = d.clickedAt || d.openedAt || sendTime(d);
    } else if (touch === "engaged" && f.opened) {
      kind = "open";
      at = d.openedAt || sendTime(d);
    }
    if (!kind) continue;
    const t = toTime(at);
    if (!Number.isFinite(t)) continue;
    if (!map.has(d.contactId)) map.set(d.contactId, []);
    map.get(d.contactId).push({ t, kind, deliveryId: d.id, campaignId: d.campaignId, channel: d.channel, variant: d.variant, to: d.to });
  }
  for (const list of map.values()) list.sort((a, b) => a.t - b.t);
  return map;
}

function pickCredits(touches, model) {
  if (!touches.length) return [];
  if (model === "linear") return touches.map((touch) => ({ touch, weight: 1 / touches.length }));
  if (model === "first_touch") return [{ touch: touches[0], weight: 1 }];
  // Last click: latest click wins; with no click in the window the latest open does.
  const clicks = touches.filter((x) => x.kind === "click");
  const pool = clicks.length ? clicks : touches;
  return [{ touch: pool[pool.length - 1], weight: 1 }];
}

// Credits each conversion. Events carrying a delivery/campaign id (tracked links) add a direct click touch.
export function attribute(conversions, deliveries, cfg = DEFAULT_ATTRIBUTION, { campaignsById = new Map() } = {}) {
  const config = normalizeAttribution(cfg);
  const touches = buildTouches(deliveries, config);
  const deliveriesById = new Map((deliveries || []).map((d) => [d.id, d]));
  const windowMs = config.windowDays * DAY;
  const rows = [];
  for (const e of conversions || []) {
    const t = toTime(e.occurredAt);
    if (!Number.isFinite(t)) continue;
    const candidates = (touches.get(e.contactId) || []).filter((x) => x.t <= t && x.t >= t - windowMs);
    if (e.deliveryId || e.campaignId) {
      const d = deliveriesById.get(e.deliveryId);
      const campaignId = d?.campaignId || e.campaignId || null;
      if (campaignId && !candidates.some((x) => x.deliveryId && x.deliveryId === e.deliveryId)) {
        candidates.push({
          t,
          kind: "click",
          direct: true,
          deliveryId: d?.id || e.deliveryId || null,
          campaignId,
          channel: d?.channel || campaignsById.get(campaignId)?.channel || "email",
          variant: d?.variant || null,
          to: d?.to || null,
        });
        candidates.sort((a, b) => a.t - b.t);
      }
    }
    const credits = pickCredits(candidates, config.model).map(({ touch, weight }) => ({
      campaignId: touch.campaignId || null,
      channel: touch.channel || "email",
      deliveryId: touch.deliveryId || null,
      variant: touch.variant || null,
      to: touch.to || null,
      kind: touch.kind,
      direct: Boolean(touch.direct),
      weight,
      hoursBefore: (t - touch.t) / 3600000,
    }));
    rows.push({
      eventId: e.id,
      name: e.name,
      contactId: e.contactId,
      at: e.occurredAt,
      revenue: Number(e.revenue) || 0,
      currency: e.currency || null,
      source: eventSource(e),
      credits,
    });
  }
  return rows;
}

export function attributionTotals(rows) {
  let conversions = 0;
  let revenue = 0;
  let attributedConversions = 0;
  let attributedRevenue = 0;
  for (const r of rows || []) {
    conversions += 1;
    revenue += r.revenue;
    const w = r.credits.reduce((s, c) => s + c.weight, 0);
    attributedConversions += w;
    attributedRevenue += r.revenue * w;
  }
  return { conversions, revenue, attributedConversions, attributedRevenue };
}

// Sums credited conversions/revenue per key of each credit (campaign, channel, variant…).
export function creditsBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows || []) {
    for (const c of r.credits) {
      const key = keyFn(c, r);
      if (key == null) continue;
      const acc = map.get(key) || { key, conversions: 0, revenue: 0 };
      acc.conversions += c.weight;
      acc.revenue += r.revenue * c.weight;
      map.set(key, acc);
    }
  }
  return map;
}

// All conversions by source, with how much of each was credited to messages.
export function bySource(rows) {
  const map = new Map();
  for (const r of rows || []) {
    const acc = map.get(r.source) || { source: r.source, conversions: 0, revenue: 0, attributedRevenue: 0, attributedConversions: 0 };
    const w = r.credits.reduce((s, c) => s + c.weight, 0);
    acc.conversions += 1;
    acc.revenue += r.revenue;
    acc.attributedConversions += w;
    acc.attributedRevenue += r.revenue * w;
    map.set(r.source, acc);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue || b.conversions - a.conversions);
}

// Campaign id -> { conversions, revenue } under the given model, for rollups and comparisons.
export function attributedByCampaign(events, deliveries, cfg = DEFAULT_ATTRIBUTION, opts = {}) {
  const config = normalizeAttribution(cfg);
  const rows = attribute(conversionEvents(events, config), deliveries, config, opts);
  return creditsBy(rows, (c) => c.campaignId);
}
