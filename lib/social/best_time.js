// Best-time suggestions (isomorphic, pure) computed only from the account's own published posts and their
// insights snapshots: posts are bucketed by local weekday and hour, ranked by average engagement rate
// (engagement / reach) or raw engagement when reach isn't reported. Too little history returns `enough: false`.

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function engagementOf(metrics) {
  const m = metrics && typeof metrics === "object" ? metrics : {};
  if (m.engagement != null) return num(m.engagement);
  if (m.totalInteractions != null) return num(m.totalInteractions);
  return num(m.likes) + num(m.comments) + num(m.shares) + num(m.saves) + num(m.reactions);
}

export function reachOf(metrics) {
  const m = metrics && typeof metrics === "object" ? metrics : {};
  return num(m.reach) || num(m.views) || num(m.impressions);
}

export function engagementRate(metrics) {
  const reach = reachOf(metrics);
  return reach ? engagementOf(metrics) / reach : null;
}

// Next future occurrence of (weekday, hour) in local time.
export function nextOccurrence(weekday, hour, now = Date.now()) {
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  d.setHours(hour);
  let delta = (weekday - d.getDay() + 7) % 7;
  if (delta === 0 && d.getTime() <= now) delta = 7;
  d.setDate(d.getDate() + delta);
  return d;
}

export function slotLabel(weekday, hour) {
  const h12 = hour % 12 || 12;
  return `${WEEKDAYS[weekday]} ${h12}${hour < 12 ? "am" : "pm"}`;
}

// targets: normalized published targets ({ network, publishedAt, metrics }).
export function bestTimes(targets, { network = null, minPosts = 5, top = 3, now = Date.now() } = {}) {
  const usable = (targets || []).filter(
    (t) => t?.publishedAt && (!network || t.network === network) && (engagementOf(t.metrics) > 0 || reachOf(t.metrics) > 0),
  );
  if (usable.length < minPosts) return { enough: false, sample: usable.length, needed: minPosts, slots: [] };

  const useRate = usable.filter((t) => reachOf(t.metrics) > 0).length >= Math.ceil(usable.length / 2);
  const buckets = new Map();
  for (const t of usable) {
    const at = new Date(t.publishedAt);
    const key = `${at.getDay()}-${at.getHours()}`;
    const b = buckets.get(key) || { weekday: at.getDay(), hour: at.getHours(), posts: 0, engagement: 0, rateSum: 0, rateCount: 0 };
    b.posts += 1;
    b.engagement += engagementOf(t.metrics);
    const rate = engagementRate(t.metrics);
    if (rate != null) {
      b.rateSum += rate;
      b.rateCount += 1;
    }
    buckets.set(key, b);
  }

  const slots = [...buckets.values()]
    .map((b) => ({
      weekday: b.weekday,
      hour: b.hour,
      posts: b.posts,
      avgEngagement: b.engagement / b.posts,
      avgRate: b.rateCount ? b.rateSum / b.rateCount : null,
    }))
    .sort((a, b) => (useRate ? (b.avgRate ?? 0) - (a.avgRate ?? 0) : 0) || b.avgEngagement - a.avgEngagement || b.posts - a.posts)
    .slice(0, top)
    .map((s) => ({ ...s, label: slotLabel(s.weekday, s.hour), nextAt: nextOccurrence(s.weekday, s.hour, now).toISOString() }));

  return { enough: true, sample: usable.length, needed: minPosts, metric: useRate ? "rate" : "engagement", slots };
}
