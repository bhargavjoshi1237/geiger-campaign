// Campaign content fingerprint (isomorphic, pure): a stable hash of everything a reviewer signs off on —
// sender, subject, preheader, content, audience and the A/B setup. Approval holds only while it matches.
// Accepts a raw campaigns row (snake_case) or a normalized campaign model (camelCase).

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .filter((k) => value[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stable(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

// FNV-1a, 32-bit, rendered as 8 hex chars; collisions only matter between two versions of one campaign.
function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

const pick = (c, camel, snake) => c?.[camel] ?? c?.[snake] ?? "";

// The A/B fields a reviewer approves; the delivery engine's winner bookkeeping is excluded.
function abShape(ab) {
  if (!ab || typeof ab !== "object" || !ab.enabled) return null;
  return {
    testOn: ab.testOn ?? null,
    variants: Array.isArray(ab.variants) ? ab.variants : [],
    testPercent: ab.testPercent ?? null,
    winnerMetric: ab.winnerMetric ?? null,
    durationHours: ab.durationHours ?? null,
  };
}

export function campaignFingerprint(campaign) {
  const c = campaign || {};
  return fnv1a(
    stable({
      channel: pick(c, "channel", "channel"),
      subject: pick(c, "subject", "subject"),
      preheader: pick(c, "preheader", "preheader"),
      fromName: pick(c, "fromName", "from_name"),
      fromEmail: pick(c, "fromEmail", "from_email"),
      replyTo: pick(c, "replyTo", "reply_to"),
      content: c.content ?? {},
      audience: c.audience ?? {},
      ab: abShape(c.ab),
    }),
  );
}
