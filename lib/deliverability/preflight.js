// Content pre-flight for a test or campaign email (isomorphic, pure, deterministic): spam-trigger
// phrases, image/text balance, links, unsubscribe presence, message size and sender domain. Each check
// is { key, label, status: pass | warn | fail, detail }.

export const SPAM_PHRASES = [
  "100% free", "act now", "apply now", "as seen on", "being a member", "billion dollars", "buy direct",
  "call now", "cancel at any time", "cash bonus", "cheap meds", "click below", "click here", "congratulations you",
  "dear friend", "double your", "earn extra cash", "eliminate debt", "extra income", "fast cash", "for only",
  "free access", "free gift", "free money", "free trial", "get paid", "giveaway", "guaranteed", "increase sales",
  "lose weight", "lowest price", "make money", "miracle", "money back", "no catch", "no credit check",
  "no obligation", "not spam", "once in a lifetime", "order now", "risk-free", "risk free", "special promotion",
  "this isn't spam", "urgent", "while supplies last", "winner", "won a", "you have been selected", "you're a winner",
];

const SHORTENERS = ["bit.ly", "tinyurl.com", "goo.gl", "ow.ly", "t.co", "is.gd", "buff.ly", "rebrand.ly", "cutt.ly", "shorturl.at", "tiny.cc"];

export const GMAIL_CLIP_BYTES = 102 * 1024;

export function htmlToText(html) {
  return String(html || "")
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h\d|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

const byteLength = (s) => (typeof TextEncoder !== "undefined" ? new TextEncoder().encode(s).length : String(s).length);

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

function extractLinks(html) {
  const links = [];
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) links.push({ href: m[1].trim(), text: htmlToText(m[2]) });
  return links;
}

const check = (key, label, status, detail) => ({ key, label, status, detail });

export function runPreflight({ subject = "", html = "", fromEmail = "", verifiedDomains = null } = {}) {
  const text = htmlToText(html);
  const lowerAll = `${subject}\n${text}`.toLowerCase();
  const checks = [];

  // Subject
  const subj = String(subject || "").trim();
  const capsWords = subj.split(/\s+/).filter((w) => w.length > 2 && /[A-Z]/.test(w) && w === w.toUpperCase());
  if (!subj) checks.push(check("subject", "Subject line", "fail", "The message has no subject."));
  else if (/^(re|fwd?):/i.test(subj)) checks.push(check("subject", "Subject line", "warn", "Fake reply or forward prefixes are a classic spam signal."));
  else if (capsWords.length >= 2) checks.push(check("subject", "Subject line", "warn", `${capsWords.length} words in capitals (${capsWords.slice(0, 3).join(", ")}). Shouting in subjects lowers placement.`));
  else if (/[!?$]{2,}/.test(subj)) checks.push(check("subject", "Subject line", "warn", "Repeated !, ? or $ in the subject reads as spam."));
  else if (subj.length > 78) checks.push(check("subject", "Subject line", "warn", `${subj.length} characters. Most inboxes cut subjects off around 60.`));
  else checks.push(check("subject", "Subject line", "pass", `${subj.length} characters.`));

  // Spam-trigger phrases
  const hits = SPAM_PHRASES.filter((p) => lowerAll.includes(p));
  checks.push(
    check(
      "spam_words",
      "Spam-trigger phrases",
      hits.length === 0 ? "pass" : hits.length <= 2 ? "warn" : "fail",
      hits.length ? `Found ${hits.map((h) => `"${h}"`).join(", ")}. Rephrase them in plain language.` : "None found.",
    ),
  );

  // Unsubscribe
  const hasUnsubscribe = /unsubscribe|opt[\s-]?out|manage (your )?(email )?preferences|\{\{\s*unsubscribe/i.test(html);
  checks.push(
    check(
      "unsubscribe",
      "Unsubscribe link",
      hasUnsubscribe ? "pass" : "fail",
      hasUnsubscribe ? "Found an unsubscribe link." : "No unsubscribe link. Gmail and Yahoo require an easy way to opt out of bulk mail.",
    ),
  );

  // Images vs text
  const images = html.match(/<img\b[^>]*>/gi) || [];
  const missingAlt = images.filter((tag) => !/\balt\s*=/i.test(tag)).length;
  const textChars = text.replace(/\s+/g, "").length;
  if (images.length && textChars < 200) {
    checks.push(check("image_ratio", "Image-to-text balance", "fail", `${images.length} image${images.length === 1 ? "" : "s"} and only ${textChars} characters of text. Image-only mail is filtered as spam and unreadable with images off.`));
  } else if (images.length && textChars / images.length < 300) {
    checks.push(check("image_ratio", "Image-to-text balance", "warn", `About ${Math.round(textChars / images.length)} characters of text per image. Aim for at least 300.`));
  } else {
    checks.push(check("image_ratio", "Image-to-text balance", "pass", `${images.length} image${images.length === 1 ? "" : "s"}, ${textChars.toLocaleString("en-US")} characters of text.`));
  }
  checks.push(
    check(
      "alt_text",
      "Image alt text",
      missingAlt ? "warn" : "pass",
      missingAlt ? `${missingAlt} image${missingAlt === 1 ? " has" : "s have"} no alt attribute.` : images.length ? "Every image has alt text." : "No images.",
    ),
  );

  // Links
  const links = extractLinks(html).filter((l) => !/^(mailto:|tel:|#|\{\{)/i.test(l.href));
  const shortened = links.filter((l) => SHORTENERS.includes(hostOf(l.href)));
  const mismatched = links.filter((l) => {
    const shown = l.text.match(/^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i);
    return shown && hostOf(l.href) && hostOf(/^https?:/i.test(l.text) ? l.text : `http://${l.text}`) !== hostOf(l.href);
  });
  const insecure = links.filter((l) => /^http:\/\//i.test(l.href));
  const linkIssues = [];
  if (shortened.length) linkIssues.push(`${shortened.length} shortened link${shortened.length === 1 ? "" : "s"} (${hostOf(shortened[0].href)}); shorteners are often blocklisted`);
  if (mismatched.length) linkIssues.push(`${mismatched.length} link${mismatched.length === 1 ? " shows" : "s show"} one domain but point${mismatched.length === 1 ? "s" : ""} to another`);
  if (links.length > 30) linkIssues.push(`${links.length} links; keep it under 30`);
  if (insecure.length) linkIssues.push(`${insecure.length} link${insecure.length === 1 ? " uses" : "s use"} http:// instead of https://`);
  checks.push(check("links", "Links", linkIssues.length ? "warn" : "pass", linkIssues.length ? `${linkIssues.join("; ")}.` : `${links.length} link${links.length === 1 ? "" : "s"}, all look fine.`));

  // Size
  const size = byteLength(html);
  const kb = Math.round(size / 1024);
  checks.push(
    check(
      "size",
      "Message size",
      size > GMAIL_CLIP_BYTES ? "fail" : size > 80 * 1024 ? "warn" : "pass",
      size > GMAIL_CLIP_BYTES
        ? `${kb} KB. Gmail clips messages over 102 KB, hiding the footer and unsubscribe link.`
        : size > 80 * 1024
          ? `${kb} KB, close to Gmail's 102 KB clipping limit.`
          : `${kb} KB.`,
    ),
  );

  // Active content
  const active = (html.match(/<(script|form|iframe|embed|object)\b/gi) || []).map((t) => t.slice(1).toLowerCase());
  checks.push(
    check("active_content", "Scripts and forms", active.length ? "fail" : "pass", active.length ? `Contains <${[...new Set(active)].join(">, <")}>. Mailbox providers strip or flag it.` : "None."),
  );

  // Sender domain
  if (verifiedDomains) {
    const domain = String(fromEmail || "").split("@")[1]?.toLowerCase() || "";
    const ok = domain && verifiedDomains.includes(domain);
    checks.push(
      check(
        "sender",
        "Sender domain",
        ok ? "pass" : "fail",
        !domain ? "Add a from address on a verified sending domain." : ok ? `${domain} is verified.` : `${domain} isn't a verified sending domain. Verify it under Sending Domains first.`,
      ),
    );
  }

  const counts = { pass: 0, warn: 0, fail: 0 };
  for (const c of checks) counts[c.status] += 1;
  return {
    checks,
    counts,
    status: counts.fail ? "fail" : counts.warn ? "warn" : "pass",
    sizeBytes: size,
    textLength: textChars,
    imageCount: images.length,
    linkCount: links.length,
    spamPhrases: hits,
  };
}

// Mailbox provider from the seed address domain (consumer domains only; the send route refines by MX).
export function mailboxProvider(email) {
  const domain = String(email || "").split("@")[1]?.toLowerCase() || "";
  if (/^(gmail|googlemail)\.com$/.test(domain)) return "Gmail";
  if (/^(outlook|hotmail|live|msn)\./.test(domain)) return "Outlook";
  if (/^(yahoo|ymail|aol)\./.test(domain)) return "Yahoo";
  if (/^(icloud|me|mac)\.com$/.test(domain)) return "Apple iCloud";
  if (/^(proton\.me|protonmail\.com|pm\.me)$/.test(domain)) return "Proton";
  if (/^(gmx\.|web\.de)/.test(domain)) return "GMX";
  return "Other";
}

export const PLACEMENTS = [
  { value: "pending", label: "Not recorded" },
  { value: "inbox", label: "Inbox" },
  { value: "promotions", label: "Promotions / other tab" },
  { value: "spam", label: "Spam" },
  { value: "missing", label: "Didn't arrive" },
];

// { total, recorded, inbox, promotions, spam, missing, pending, inboxRate, spamRate } over recorded mailboxes.
export function placementSummary(results = []) {
  const counts = { inbox: 0, promotions: 0, spam: 0, missing: 0, pending: 0 };
  for (const r of results) counts[r.placement in counts ? r.placement : "pending"] += 1;
  const recorded = results.length - counts.pending;
  const rate = (n) => (recorded ? Math.round((n / recorded) * 100) : null);
  return {
    total: results.length,
    recorded,
    ...counts,
    inboxRate: rate(counts.inbox + counts.promotions),
    primaryRate: rate(counts.inbox),
    spamRate: rate(counts.spam),
    missingRate: rate(counts.missing),
  };
}
