// Deliverability seed: Halcyon Studio's sending domains (each in a different state), provider-assigned
// dedicated IPs in RFC 5737 documentation ranges, warm-up plans for an IP and the WhatsApp/SMS numbers,
// seed-list placement tests, DNSBL history and email validation results. Domain records and auth are
// computed with the real evaluator from seeded DNS answers, so the screens read exactly what a live check
// would store. Raw snake_case rows, deterministic, relative dates.

import { PLAYGROUND_PERSON } from "../cast.js";
import { dateOnly, daysAgo, hoursAgo, noise, PROJECT_ID, seedIds } from "./helpers.js";
import { evaluateDomain, lookupKey } from "../../deliverability/auth_checks.js";
import { DOMAIN_BLOCKLISTS, IP_BLOCKLISTS } from "../../deliverability/blocklists.js";
import { mailboxProvider, runPreflight } from "../../deliverability/preflight.js";
import { buildWarmupSchedule } from "../../deliverability/warmup_curves.js";

const aid = seedIds({
  sending_domain: 700,
  dedicated_ip: 701,
  warmup_plan: 702,
  placement_test: 703,
  blocklist_check: 704,
  email_validation: 705,
  blocklist_run: 706,
});

const OWNER = PLAYGROUND_PERSON.id;
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// A deterministic stand-in for a 2048-bit RSA public key (same length as a real one).
function fakeKey(n) {
  let body = "";
  for (let i = 0; i < 348; i++) body += B64[Math.floor(noise(n * 1000 + i) * 64)];
  return `MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA${body}IDAQAB`;
}

const row = (kind, n, created, extra) => ({
  id: aid(kind, n),
  project_id: PROJECT_ID,
  metadata: {},
  created_by: OWNER,
  created_at: daysAgo(created),
  updated_at: daysAgo(Math.max(0, created - 1)),
  deleted_at: null,
  ...extra,
});

const txt = (...answers) => ({ answers, error: null });
const mx = (exchange, priority = 10) => ({ answers: [{ exchange, priority }], error: null });
const ORG_DMARC = { [lookupKey("TXT", "_dmarc.halcyon.studio")]: txt("v=DMARC1; p=none; rua=mailto:dmarc@halcyon.studio") };

// Each domain: settings, DNS answers and dates; records/auth/status come from evaluateDomain.
const DOMAINS = [
  {
    n: 1,
    domain: "mail.halcyon.studio",
    region: "us-east-1",
    created: 140,
    verifiedAt: daysAgo(138),
    checked: hoursAgo(5),
    settings: { dmarcPolicy: "quarantine", dmarcRua: "dmarc@halcyon.studio", dkimKey: fakeKey(1) },
    lookups: {
      [lookupKey("TXT", "resend._domainkey.mail.halcyon.studio")]: txt(`p=${fakeKey(1)}`),
      [lookupKey("TXT", "send.mail.halcyon.studio")]: txt("v=spf1 include:amazonses.com ~all"),
      [lookupKey("MX", "send.mail.halcyon.studio")]: mx("feedback-smtp.us-east-1.amazonses.com"),
      [lookupKey("TXT", "_dmarc.mail.halcyon.studio")]: txt("v=DMARC1; p=quarantine; rua=mailto:dmarc@halcyon.studio; adkim=r; aspf=r"),
      [lookupKey("TXT", "mail.halcyon.studio")]: txt("v=spf1 include:_spf.google.com ~all"),
    },
  },
  {
    n: 2,
    domain: "news.halcyon.studio",
    region: "eu-west-1",
    created: 96,
    verifiedAt: daysAgo(95),
    checked: hoursAgo(9),
    settings: { dmarcPolicy: "none", dmarcRua: "dmarc@halcyon.studio" },
    lookups: {
      [lookupKey("TXT", "resend._domainkey.news.halcyon.studio")]: txt(`p=${fakeKey(2)}`),
      [lookupKey("TXT", "send.news.halcyon.studio")]: txt("v=spf1 include:amazonses.com ~all"),
      [lookupKey("MX", "send.news.halcyon.studio")]: mx("feedback-smtp.eu-west-1.amazonses.com"),
      [lookupKey("TXT", "news.halcyon.studio")]: txt("v=spf1 include:_spf.google.com ~all", "v=spf1 include:mailgun.org ~all"),
      ...ORG_DMARC,
    },
  },
  {
    n: 3,
    domain: "events.halcyon.studio",
    region: "us-east-1",
    created: 3,
    verifiedAt: null,
    checked: hoursAgo(2),
    settings: { dmarcPolicy: "none", dmarcRua: "dmarc@halcyon.studio" },
    lookups: {
      [lookupKey("TXT", "send.events.halcyon.studio")]: txt("v=spf1 include:amazonses.com ~all"),
      ...ORG_DMARC,
    },
  },
  {
    n: 4,
    domain: "promo.halcyon.studio",
    region: "us-east-1",
    created: 64,
    verifiedAt: daysAgo(62),
    checked: hoursAgo(14),
    settings: { dmarcPolicy: "reject", dmarcRua: "" },
    lookups: {
      [lookupKey("TXT", "resend._domainkey.promo.halcyon.studio")]: txt(`p=${fakeKey(4)}`),
      [lookupKey("TXT", "send.promo.halcyon.studio")]: txt("v=spf1 include:amazonses.com ~all", "v=spf1 include:sendgrid.net -all"),
      [lookupKey("MX", "send.promo.halcyon.studio")]: mx("feedback-smtp.us-east-1.amazonses.com"),
      [lookupKey("TXT", "_dmarc.promo.halcyon.studio")]: txt("v=DMARC1; p=reject; adkim=s; aspf=s"),
    },
  },
];

function sendingDomains() {
  return DOMAINS.map((d) => {
    const result = evaluateDomain(
      { domain: d.domain, provider: "resend", region: d.region, settings: d.settings, verifiedAt: d.verifiedAt },
      d.lookups,
      { spfLookupCounts: { [`send.${d.domain}`]: 1, [d.domain]: 2 }, now: new Date(d.checked) },
    );
    return row("sending_domain", d.n, d.created, {
      domain: d.domain,
      provider: "resend",
      region: d.region,
      status: result.status,
      records: result.records,
      auth: result.auth,
      settings: d.settings,
      last_checked_at: d.checked,
      verified_at: result.verifiedAt,
      blocklist_checked_at: hoursAgo(d.n * 3),
    });
  });
}

const IPS = [
  { n: 1, ip: "198.51.100.24", pool: "marketing", status: "active", expected: "mta1.mail.halcyon.studio", found: "mta1.mail.halcyon.studio", rdns: "pass", plan: 3, created: 70 },
  { n: 2, ip: "198.51.100.25", pool: "transactional", status: "active", expected: "mta2.mail.halcyon.studio", found: "mta2.mail.halcyon.studio", rdns: "pass", plan: null, created: 70 },
  { n: 3, ip: "203.0.113.88", pool: "marketing", status: "warming", expected: "mta3.mail.halcyon.studio", found: "ip-203-0-113-88.mta.example", rdns: "mismatch", plan: 1, created: 9 },
  { n: 4, ip: "192.0.2.140", pool: "default", status: "paused", expected: "", found: null, rdns: "missing", plan: null, created: 30 },
];

function dedicatedIps() {
  return IPS.map((i) =>
    row("dedicated_ip", i.n, i.created, {
      ip: i.ip,
      pool: i.pool,
      provider: "resend",
      status: i.status,
      expected_rdns: i.expected || null,
      reverse_dns: i.found,
      rdns_status: i.rdns,
      rdns_checked_at: hoursAgo(i.n * 2),
      blocklist_checked_at: hoursAgo(i.n * 2),
      warmup_plan_id: i.plan ? aid("warmup_plan", i.plan) : null,
    }),
  );
}

function warmupPlans() {
  const plan = (n, created, extra) => {
    const schedule = buildWarmupSchedule({ channel: extra.channel, curve: extra.curve, targetVolume: extra.target_volume });
    return row("warmup_plan", n, created, { connection_id: null, ip: null, paused_at: null, completed_at: null, schedule, ...extra });
  };
  return [
    plan(1, 8, { name: "203.0.113.88 ramp", channel: "email", ip: "203.0.113.88", curve: "standard", target_volume: 150000, start_date: dateOnly(daysAgo(7)), status: "active" }),
    plan(2, 11, { name: "WhatsApp number ramp", channel: "whatsapp", connection_id: aid("connection", 3), curve: "meta_tiers", target_volume: 10000, start_date: dateOnly(daysAgo(10)), status: "active" }),
    plan(3, 53, { name: "198.51.100.24 ramp", channel: "email", ip: "198.51.100.24", curve: "standard", target_volume: 200000, start_date: dateOnly(daysAgo(52)), status: "completed", completed_at: daysAgo(22) }),
    plan(4, 6, { name: "SMS short code ramp", channel: "sms", connection_id: aid("connection", 2), curve: "conservative", target_volume: 5000, start_date: dateOnly(daysAgo(5)), status: "paused", paused_at: daysAgo(1) }),
  ];
}

const NEWSLETTER_HTML = `<html><body style="font-family:Helvetica,Arial,sans-serif;color:#1b1b1b">
<h1>The Halcyon Dispatch — October</h1>
<p>Hi {{first_name|there}}, here's what the studio shipped this month: the Kestrel Aero launch film, a new identity system for Atlas Coffee Roasters, and twelve hotel sites for Solace Summer '26.</p>
<img src="https://halcyon.studio/dispatch/october/kestrel.jpg" alt="Kestrel Aero on the Lisbon waterfront" width="560">
<p>We also opened registrations for the Halcyon Creative Summit in Lisbon. Two days of talks and workshops on brand, motion and live experiences, with a limited number of studio tours.</p>
<p><a href="https://halcyon.studio/summit">See the summit programme</a></p>
<p>Thanks for reading — the Halcyon team, Rua da Boavista 42, Lisbon.</p>
<p style="font-size:12px;color:#777"><a href="{{unsubscribe_url}}">Unsubscribe</a> · <a href="https://halcyon.studio/preferences">Manage preferences</a></p>
</body></html>`;

const LAUNCH_HTML = `<html><body style="font-family:Helvetica,Arial,sans-serif">
<h1>Kestrel Aero is here</h1>
<p>The lightest e-bike Kestrel has ever built, designed with the Halcyon studio. Pre-orders open today for the first 500 riders, with delivery from March.</p>
<img src="https://halcyon.studio/kestrel/aero-hero.jpg" alt="Kestrel Aero">
<img src="https://halcyon.studio/kestrel/aero-detail.jpg">
<p><a href="https://bit.ly/kestrel-aero">Reserve yours</a></p>
<p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>
</body></html>`;

const PROMO_HTML = `<html><body>
<img src="https://halcyon.studio/solace/summer-banner.jpg" width="600">
<p>FREE room upgrade — act now, while supplies last! Click here to claim your 100% free upgrade.</p>
<a href="http://solacehotels.example/offer">solacehotels.example/summer</a>
</body></html>`;

const SEEDS = ["halcyon.seeds@gmail.com", "halcyon.seeds2@gmail.com", "halcyon-seeds@outlook.com", "halcyonseeds@yahoo.com", "halcyon.seeds@icloud.com", "seeds@halcyon.studio"];
const seedProvider = (email) => (email.endsWith("@halcyon.studio") ? "Google Workspace" : mailboxProvider(email));
const seedList = (emails) => emails.map((email) => ({ email, provider: seedProvider(email) }));
const VERIFIED = ["mail.halcyon.studio", "news.halcyon.studio"];

function placementTests() {
  const results = (placements, recordedAt) =>
    SEEDS.slice(0, placements.length).map((email, i) => ({
      email,
      provider: seedProvider(email),
      placement: placements[i],
      deliveryId: null,
      deliveryStatus: "sent",
      error: null,
      recordedAt: placements[i] === "pending" ? null : recordedAt,
    }));
  const test = (n, created, extra) =>
    row("placement_test", n, created, {
      content_source: "custom",
      campaign_id: null,
      results: [],
      sent_at: null,
      completed_at: null,
      preflight: runPreflight({ subject: extra.subject, html: extra.html, fromEmail: extra.from_email, verifiedDomains: VERIFIED }),
      ...extra,
    });
  return [
    test(1, 2, {
      name: "Kestrel Aero launch pre-send",
      subject: "Kestrel Aero is here — reserve yours",
      from_email: "hello@mail.halcyon.studio",
      html: LAUNCH_HTML,
      seed_addresses: seedList(SEEDS.slice(0, 5)),
      results: results(["inbox", "pending", "pending", "inbox", "pending"], hoursAgo(2)),
      status: "awaiting_results",
      sent_at: hoursAgo(3),
    }),
    test(2, 6, {
      name: "October dispatch seed test",
      subject: "The Halcyon Dispatch — October",
      from_email: "dispatch@news.halcyon.studio",
      html: NEWSLETTER_HTML,
      seed_addresses: seedList(SEEDS),
      results: results(["promotions", "inbox", "spam", "inbox", "inbox", "inbox"], daysAgo(6)),
      status: "completed",
      sent_at: daysAgo(6, 2),
      completed_at: daysAgo(6),
    }),
    test(3, 21, {
      name: "Solace summer offer pre-send",
      subject: "FREE upgrade — Act NOW!!",
      from_email: "offers@mail.halcyon.studio",
      html: PROMO_HTML,
      seed_addresses: seedList(SEEDS.slice(0, 4)),
      results: results(["spam", "spam", "spam", "inbox"], daysAgo(20)),
      status: "completed",
      sent_at: daysAgo(20, 3),
      completed_at: daysAgo(20),
    }),
    test(4, 1, {
      name: "Atlas rebrand announcement",
      subject: "Meet the new Atlas Coffee Roasters",
      from_email: "hello@mail.halcyon.studio",
      content_source: "campaign",
      campaign_id: aid("campaign", 11),
      html: "",
      seed_addresses: seedList(SEEDS.slice(0, 4)),
      status: "draft",
      preflight: {},
    }),
  ];
}

// Blocklist history: newest run first per target; 203.0.113.88 picked up a SpamCop listing today.
function blocklistChecks() {
  const rows = [];
  let n = 0;
  let run = 0;
  const add = (target, targetType, checkedValue, list, hoursBack, link, listed = false) => {
    n += 1;
    rows.push({
      id: aid("blocklist_check", n),
      project_id: PROJECT_ID,
      target,
      target_type: targetType,
      checked_value: checkedValue,
      list: list.zone,
      list_name: list.name,
      status: listed ? "listed" : "clear",
      listed,
      detail: listed ? "Listed (127.0.0.2). Blocked - see https://www.spamcop.net/bl.shtml" : "Not listed.",
      codes: listed ? ["127.0.0.2"] : [],
      run_id: aid("blocklist_run", run),
      sending_domain_id: link.domain || null,
      dedicated_ip_id: link.ip || null,
      checked_at: hoursAgo(hoursBack),
      metadata: {},
      created_by: null,
      created_at: hoursAgo(hoursBack),
      updated_at: hoursAgo(hoursBack),
      deleted_at: null,
    });
  };
  IPS.forEach((ip, i) => {
    for (const day of [0, 1, 2]) {
      run += 1;
      const hoursBack = (i + 1) * 2 + day * 24;
      for (const list of IP_BLOCKLISTS) add(ip.ip, "ip", ip.ip, list, hoursBack, { ip: aid("dedicated_ip", ip.n) }, ip.n === 3 && day === 0 && list.zone === "bl.spamcop.net");
    }
  });
  DOMAINS.forEach((d, i) => {
    for (const day of [0, 1]) {
      run += 1;
      const hoursBack = (i + 1) * 3 + day * 24;
      const link = { domain: aid("sending_domain", d.n) };
      for (const list of DOMAIN_BLOCKLISTS) add(d.domain, "domain", d.domain, list, hoursBack, link);
      for (const list of IP_BLOCKLISTS) add(d.domain, "domain", `198.51.100.${10 + d.n}`, list, hoursBack, link);
    }
  });
  run += 1;
  for (const list of DOMAIN_BLOCKLISTS) add("halcyon.studio", "domain", "halcyon.studio", list, 74, {});
  return rows;
}

const VALIDATIONS = [
  ["erin@northwind-outdoor.example", "invalid", ["null_mx"], null],
  ["maya.chen@gmail.com", "valid", [], null],
  ["jonas.weber@outlook.com", "valid", [], null],
  ["info@atlascoffee.example", "invalid", ["null_mx"], null],
  ["grace.okafor@yahoo.com", "valid", [], null],
  ["pieter@kestrelbikes.nl", "valid", [], null],
  ["sales@solacehotels.com", "risky", ["role_account"], null],
  ["felix.brandt@gmial.com", "risky", ["typo"], "felix.brandt@gmail.com"],
  ["amara.osei@hotmail.co.uk", "valid", [], null],
  ["daniel.price@meridianbank.com", "valid", [], null],
  ["lucia.ferrer@icloud.com", "valid", [], null],
  ["summit-signup@mailinator.com", "risky", ["disposable"], null],
  ["noreply@halcyon.studio", "risky", ["role_account"], null],
  ["tomas.silva@protonmail.com", "valid", [], null],
  ["ravi@halcyon-old-domain.com", "invalid", ["domain_not_found"], null],
  ["kenji.watanabe@yaho.com", "risky", ["a_fallback", "typo"], "kenji.watanabe@yahoo.com"],
  ["priya..nair@gmail.com", "invalid", ["syntax"], null],
  ["hana.kim@fastmail.com", "valid", [], null],
  ["support@orbitaudio.de", "risky", ["role_account"], null],
  ["ava.johnson@studio-mail.co", "unknown", ["dns_error"], null],
];

const MX = {
  "gmail.com": [{ exchange: "gmail-smtp-in.l.google.com", priority: 5 }],
  "outlook.com": [{ exchange: "outlook-com.olc.protection.outlook.com", priority: 5 }],
  "hotmail.co.uk": [{ exchange: "eur.olc.protection.outlook.com", priority: 2 }],
  "yahoo.com": [{ exchange: "mta5.am0.yahoodns.net", priority: 1 }],
  "icloud.com": [{ exchange: "mx01.mail.icloud.com", priority: 10 }],
  "protonmail.com": [{ exchange: "mail.protonmail.ch", priority: 5 }],
  "fastmail.com": [{ exchange: "in1-smtp.messagingengine.com", priority: 10 }],
  "mailinator.com": [{ exchange: "mail.mailinator.com", priority: 1 }],
  "halcyon.studio": [{ exchange: "aspmx.l.google.com", priority: 1 }],
};

function emailValidations() {
  return VALIDATIONS.map(([email, result, reasons, suggestion], i) => {
    const domain = email.split("@")[1];
    const checked = hoursAgo(6 + i * 7);
    return {
      id: aid("email_validation", i + 1),
      project_id: PROJECT_ID,
      email,
      domain,
      result,
      reasons,
      suggestion,
      mx: MX[domain] || (result === "valid" || reasons.includes("role_account") ? [{ exchange: `mx.${domain}`, priority: 10 }] : []),
      checked_at: checked,
      contact_id: null,
      source: i < 12 ? "manual" : "contacts",
      metadata: reasons.includes("syntax") ? { problem: "The part before the @ has invalid characters or dots in the wrong place." } : {},
      created_by: OWNER,
      created_at: checked,
      updated_at: checked,
      deleted_at: null,
    };
  });
}

export function deliverabilitySeed() {
  return {
    sending_domains: sendingDomains(),
    dedicated_ips: dedicatedIps(),
    warmup_plans: warmupPlans(),
    placement_tests: placementTests(),
    blocklist_checks: blocklistChecks(),
    email_validations: emailValidations(),
  };
}
