// Audience seed: Halcyon Studio's audience — the cast's clients and prospects, studio staff and newsletter
// readers (contacts n=1..48), four lists with memberships, six saved segments, the tag catalog, custom
// fields, the consent ledger, suppressions and lead-scoring rules. Statuses mirror the Delivery engine
// seed (who unsubscribed, bounced or complained on which campaign); lead scores, last activity and
// segment counts are computed with the real engines over that seed's deliveries and events.
// Raw snake_case rows, exactly what Supabase returns.

import { CLIENTS, PLAYGROUND_PERSON, personId } from "../cast.js";
import { PROJECT_ID, between, daysAgo, daysFromNow, hoursAgo, noise, seedIds } from "./helpers.js";
import { deliveriesSeed } from "./deliveries.js";
import { scoreContact } from "../../audience/scoring.js";
import { buildContextIndex, filterBySegment } from "../../audience/evaluate.js";
import { toContactModel } from "../../audience/contact_model.js";

// Audience code block 200-299 (core kinds contact/list/list_member/segment come from helpers).
const aid = seedIds({ tag: 200, custom_field: 201, scoring_rule: 202, suppression: 203, contact_consent: 204 });
// CRM's company ids (code 800) so client and prospect contacts link to their companies.
const companyId = seedIds({ company: 800 });

const DAY = 86_400_000;
const PRIYA = personId(10);
const OWNER = PLAYGROUND_PERSON.id;

// Mirrors lib/playground/seed/deliveries.js: contact n -> the campaign n it left on.
const UNSUBSCRIBED = { 13: 3, 29: 6, 41: 7 };
const BOUNCED = { 22: 1, 37: 4 };
const COMPLAINED = { 44: 5 };

const ZONES = {
  Lisbon: ["Europe/Lisbon", "pt-PT"],
  Porto: ["Europe/Lisbon", "pt-PT"],
  Brooklyn: ["America/New_York", "en-US"],
  "New York": ["America/New_York", "en-US"],
  Boston: ["America/New_York", "en-US"],
  Portland: ["America/Los_Angeles", "en-US"],
  Chicago: ["America/Chicago", "en-US"],
  Denver: ["America/Denver", "en-US"],
  Toronto: ["America/Toronto", "en-CA"],
  London: ["Europe/London", "en-GB"],
  Dublin: ["Europe/Dublin", "en-IE"],
  Berlin: ["Europe/Berlin", "de-DE"],
  Vienna: ["Europe/Vienna", "de-AT"],
  Amsterdam: ["Europe/Amsterdam", "nl-NL"],
  Barcelona: ["Europe/Madrid", "es-ES"],
  Madrid: ["Europe/Madrid", "es-ES"],
  Paris: ["Europe/Paris", "fr-FR"],
  Lyon: ["Europe/Paris", "fr-FR"],
  Stockholm: ["Europe/Stockholm", "sv-SE"],
  Copenhagen: ["Europe/Copenhagen", "da-DK"],
  Prague: ["Europe/Prague", "cs-CZ"],
  "São Paulo": ["America/Sao_Paulo", "pt-BR"],
};

const client = (key) => CLIENTS.find((c) => c.key === key);
const COMPANY_N = { northwind: 1, atlas: 2, lumen: 3, kestrel: 4, solace: 5, orbit: 6, fernway: 7, meridian: 8, brightline: 9, pinecrest: 10, harbor: 11, quanta: 12 };

// n, first, last, email, phone, city, company, job title, seniority, industry, source, created (days ago), tags, extra.
// Contacts 45-48 joined over messaging channels and have no email, so they never received the email campaigns.
const CONTACTS = [
  [1, "Erin", "Walsh", client("northwind").email, "+15035550142", "Portland", "Northwind Outdoor", "Brand Director", "Director", "Retail", "manual", 412, ["client", "vip"], { company: "northwind" }],
  [2, "Diogo", "Matos", client("atlas").email, "+351912480133", "Lisbon", "Atlas Coffee Roasters", "Marketing Manager", "Manager", "Food & beverage", "manual", 388, ["client", "lisbon"], { company: "atlas" }],
  [3, "Grace", "Okafor", client("lumen").email, "+16175550118", "Boston", "Lumen Health", "VP Marketing", "VP", "Healthcare", "manual", 351, ["client"], { company: "lumen" }],
  [4, "Pieter", "de Vries", client("kestrel").email, "+31612345078", "Amsterdam", "Kestrel Bikes", "Head of Brand", "Director", "Mobility", "manual", 302, ["client", "vip", "kestrel-aero"], { company: "kestrel" }],
  [5, "Lucía", "Ferrer", client("solace").email, "+34612480219", "Barcelona", "Solace Hotels", "Chief Marketing Officer", "C-level", "Hospitality", "manual", 284, ["client", "vip"], { company: "solace" }],
  [6, "Felix", "Brandt", client("orbit").email, "+4915112345067", "Berlin", "Orbit Audio", "Product Marketing Lead", "Manager", "Consumer goods", "manual", 263, ["client"], { company: "orbit" }],
  [7, "Amara", "Osei", client("fernway").email, "+447700900184", "London", "Fernway Foods", "Head of Packaging", "Director", "Retail", "manual", 241, ["client"], { company: "fernway" }],
  [8, "Daniel", "Price", client("meridian").email, "+12125550163", "New York", "Meridian Bank", "Communications Director", "Director", "Financial services", "manual", 222, ["client"], { company: "meridian" }],
  [9, "Marta", "Lopes", "marta@lopes-studio.example", null, "Lisbon", "Lopes Studio", "Independent designer", "Individual contributor", "Agency", "form", 203, ["lisbon", "summit-2026"], { summit: "Early bird", birthday: "1991-04-17" }],
  [10, "James", "Whitaker", "james.whitaker@outpost-media.example", "+447700900352", "London", "Outpost Media", "Creative Director", "Director", "Agency", "form", 197, ["summit-2026", "speaker"], { summit: "VIP" }],
  [11, "Inês", "Carvalho", "ines.carvalho@marea.example", "+351913570244", "Porto", "Marea Conservas", "Brand Manager", "Manager", "Food & beverage", "form", 191, ["summit-2026"], { summit: "Standard" }],
  [12, "Owen", "Brooks", "owen@trailhead-co.example", null, "Chicago", "Trailhead Co.", "Growth Marketing Manager", "Manager", "Retail", "import", 186, ["webinar-q3"], {}],
  [13, "Sara", "Lindqvist", "sara.lindqvist@nordhaus.example", null, "Stockholm", "Nordhaus", "Art Director", "Manager", "Agency", "form", 181, [], {}],
  [14, "Rafael", "Mendes", "rafael@mendes-arq.example", null, "São Paulo", "Mendes Arquitetura", "Principal architect", "C-level", "Agency", "import", 176, ["webinar-q3"], {}],
  [15, "Chloé", "Martin", "chloe.martin@atelier-nord.example", null, "Paris", "Atelier Nord", "Head of Marketing", "Director", "Consumer goods", "form", 171, ["summit-2026"], { summit: "Early bird" }],
  [16, "Tyler", "Nguyen", "tyler@wavelength.example", "+17185550191", "Brooklyn", "Wavelength", "Producer", "Individual contributor", "Agency", "event", 166, ["brooklyn"], { birthday: "1994-09-02" }],
  [17, "Hannah", "Becker", "hannah.becker@quellwerk.example", null, "Berlin", "Quellwerk", "Marketing Lead", "Manager", "Software", "form", 161, [], {}],
  [18, "Mateo", "García", "mateo@garcia-foods.example", "+34622108344", "Madrid", "García Foods", "Founder", "C-level", "Food & beverage", "checkout", 152, ["vip"], {}],
  [19, "Priya", "Nair", "priya@halcyon.studio", "+17185550110", "Brooklyn", "Halcyon Studio", "Marketing Lead", "Manager", "Agency", "manual", 420, ["team", "brooklyn"], {}],
  [20, "Noor", "Haddad", "noor@halcyon.studio", null, "Brooklyn", "Halcyon Studio", "Strategist", "Individual contributor", "Agency", "manual", 420, ["team", "brooklyn"], {}],
  [21, "Marcus", "Bell", "marcus.bell@brightline-rail.example", "+13125550126", "Chicago", "Brightline Rail", "VP Customer Experience", "VP", "Mobility", "form", 121, ["prospect"], { company: "brightline" }],
  [22, "Rachel", "Moore", "rachel.moore@pinecrest.example", null, "Denver", "Pinecrest Schools", "Director of Admissions", "Director", "Education", "import", 112, ["prospect"], { company: "pinecrest" }],
  [23, "Rui", "Fonseca", "rui@harborvine.example", "+351934220817", "Porto", "Harbor & Vine", "Owner", "C-level", "Hospitality", "form", 96, ["prospect"], { company: "harbor" }],
  [24, "Lena", "Hoffmann", "lena@quantalabs.example", null, "Berlin", "Quanta Labs", "Head of Marketing", "Director", "Software", "form", 91, ["prospect"], { company: "quanta" }],
  [25, "Ben", "Carter", "ben.carter@fieldday.example", null, "Toronto", "Field Day", "Content Strategist", "Individual contributor", "Agency", "form", 143, [], {}],
  [26, "Yuki", "Tanaka", "yuki.tanaka@kumo-design.example", null, "London", "Kumo Design", "Product Designer", "Individual contributor", "Software", "form", 137, ["summit-2026"], { summit: "Standard" }],
  [27, "Olivia", "Hart", "olivia@hart-and-co.example", "+447700900233", "London", "Hart & Co.", "Marketing Director", "Director", "Consumer goods", "event", 131, ["summit-2026", "vip"], { summit: "VIP" }],
  [28, "Nikolai", "Petrov", "nikolai@grid-ventures.example", null, "Amsterdam", "Grid Ventures", "Partner", "C-level", "Financial services", "import", 127, [], {}],
  [29, "Emma", "Laurent", "emma.laurent@maison-verte.example", null, "Paris", "Maison Verte", "Brand Manager", "Manager", "Hospitality", "form", 124, [], {}],
  [30, "Tomás", "Ribeiro", "tomas.ribeiro@costa-surf.example", "+351915330461", "Lisbon", "Costa Surf", "Ecommerce Manager", "Manager", "Retail", "checkout", 119, ["lisbon", "kestrel-aero"], {}],
  [31, "Aisha", "Rahman", "aisha.rahman@bloomwell.example", null, "New York", "Bloomwell", "Head of Growth", "Director", "Healthcare", "form", 116, [], {}],
  [32, "Lukas", "Meyer", "lukas.meyer@velotech.example", "+4917612345921", "Berlin", "Velotech", "Product Manager", "Manager", "Mobility", "checkout", 111, ["kestrel-aero"], {}],
  [33, "Freya", "Andersson", "freya@nordlys.example", null, "Copenhagen", "Nordlys", "Designer", "Individual contributor", "Agency", "form", 107, [], { birthday: "1996-12-11" }],
  [34, "Carlos", "Ortiz", "carlos.ortiz@solmar.example", "+34633901274", "Barcelona", "Solmar Resorts", "Revenue Manager", "Manager", "Hospitality", "event", 103, ["summit-2026"], { summit: "Standard" }],
  [35, "Megan", "O'Neill", "megan.oneill@greenhouse-pr.example", null, "Brooklyn", "Greenhouse PR", "PR Lead", "Manager", "Agency", "form", 99, ["press"], {}],
  [36, "André", "Costa", "andre.costa@ponto-norte.example", null, "Lisbon", "Ponto Norte", "Creative Lead", "Manager", "Agency", "event", 97, ["lisbon", "summit-2026"], { summit: "Early bird" }],
  [37, "Zoe", "Mitchell", "zoe.mitchell@brightwave.example", null, "Portland", "Brightwave", "Marketing Coordinator", "Individual contributor", "Retail", "import", 95, [], {}],
  [38, "Hugo", "Lefebvre", "hugo@lefebvre-cycles.example", "+33612345780", "Lyon", "Lefebvre Cycles", "Owner", "C-level", "Mobility", "checkout", 91, ["kestrel-aero", "vip"], {}],
  [39, "Julia", "Novak", "julia.novak@pixelfield.example", null, "Prague", "Pixelfield", "UX Lead", "Manager", "Software", "form", 87, [], {}],
  [40, "Samuel", "Adeyemi", "samuel.adeyemi@kola-foods.example", "+447700900417", "London", "Kola Foods", "Category Manager", "Manager", "Food & beverage", "event", 83, ["summit-2026"], { summit: "Standard" }],
  [41, "Clara", "Weiss", "clara.weiss@alpenhaus.example", null, "Vienna", "Alpenhaus Hotels", "Marketing Manager", "Manager", "Hospitality", "form", 79, [], {}],
  [42, "Ethan", "Ross", "ethan.ross@ridgeline.example", null, "Denver", "Ridgeline", "Brand Strategist", "Individual contributor", "Agency", "form", 75, [], {}],
  [43, "Beatriz", "Santos", "beatriz.santos@mar-azul.example", "+351916770352", "Lisbon", "Mar Azul Hotels", "Events Manager", "Manager", "Hospitality", "event", 71, ["lisbon", "summit-2026"], { summit: "Early bird" }],
  [44, "Kevin", "Doyle", "kevin.doyle@doyle-supply.example", null, "Dublin", "Doyle Supply", "Buyer", "Individual contributor", "Retail", "import", 67, [], {}],
  [45, "Joana", "Pires", null, "+351917880443", "Lisbon", "", "", "", "", "sms", 18, ["kestrel-aero", "lisbon"], {}],
  [46, "Liam", "Foster", null, null, "Brooklyn", "", "", "", "", "instagram", 12, ["summit-2026"], {}],
  [47, "Mia", "Schulz", null, "+4915223344781", "Berlin", "", "", "", "", "whatsapp", 8, ["kestrel-aero"], {}],
  [48, "Noah", "Clarke", null, null, "London", "", "", "", "", "messenger", 3, [], {}],
];

// Platform ids written by the inbound webhooks (Instagram IGSID, Messenger PSID, Telegram chat id, TikTok open id).
const digits = (n, len) => {
  let out = "";
  for (let i = 0; out.length < len; i += 1) out += Math.floor(noise(n * 53 + i) * 10);
  return out;
};
const IDENTITIES = {
  9: ["instagram"],
  11: ["instagram"],
  16: ["instagram", "tiktok"],
  18: ["messenger"],
  27: ["instagram"],
  30: ["instagram", "telegram"],
  34: ["messenger"],
  35: ["tiktok"],
  38: ["telegram"],
  43: ["instagram", "messenger"],
  46: ["instagram"],
  47: ["telegram"],
  48: ["messenger", "tiktok"],
};
function identityFor(n, channel) {
  if (channel === "instagram") return `17841${digits(n, 11)}`;
  if (channel === "messenger") return digits(n * 3, 16);
  if (channel === "telegram") return digits(n * 7, 10).replace(/^0/, "5");
  return `_000${digits(n * 11, 8)}${String.fromCharCode(65 + (n % 26))}${digits(n * 13, 6)}`;
}

// Opted-in channels beyond email (captured `days` after the contact joined), and later opt-outs.
const OPT_INS = {
  sms: [11, 16, 18, 27, 30, 32, 34, 38, 40, 43, 45, 47],
  whatsapp: [2, 5, 11, 18, 23, 30, 34, 43, 45, 47],
  rcs: [30, 32],
  push: [9, 12, 15, 17, 25, 26, 30, 31, 32, 39, 42],
};
const OPT_OUTS = [
  { n: 27, channel: "sms", days: 9, source: "SMS STOP reply", proof: { method: "keyword", keyword: "STOP" } },
  { n: 25, channel: "push", days: 21, source: "Browser permission revoked", proof: { method: "push_unsubscribe" } },
];
const PENDING = [{ n: 21, channel: "sms", days: 2, source: "Demo request form", proof: { method: "double_opt_in", keyword: "YES", note: "Confirmation text sent, awaiting reply" } }];

const CHANNEL_SOURCE = {
  sms: { source: "SMS keyword AERO to 22395", proof: { method: "keyword", keyword: "AERO" } },
  whatsapp: { source: "WhatsApp click-to-chat", proof: { method: "inbound_message" } },
  rcs: { source: "Checkout opt-in", proof: { method: "checkbox", label: "Send order updates by RCS" } },
  push: { source: "Web push on halcyon.studio/journal", proof: { method: "browser_prompt", page_url: "https://halcyon.studio/journal" } },
  instagram: { source: "Instagram DM", proof: { method: "inbound_message", keyword: "SUMMIT" } },
  messenger: { source: "Messenger chat", proof: { method: "inbound_message" } },
  telegram: { source: "Telegram /start", proof: { method: "bot_start", command: "/start" } },
  tiktok: { source: "TikTok DM", proof: { method: "inbound_message" } },
};

const EMAIL_SOURCE = {
  form: { source: "Newsletter form · halcyon.studio/journal", proof: { method: "form", form: "Newsletter signup", page_url: "https://halcyon.studio/journal" } },
  event: { source: "Halcyon Creative Summit registration", proof: { method: "event_registration", event: "Halcyon Creative Summit" } },
  checkout: { source: "Kestrel Aero pre-order checkout", proof: { method: "checkbox", label: "Email me about my order and new releases" } },
  import: { source: "Import: summit-2025-attendees.csv", proof: { method: "import", file_name: "summit-2025-attendees.csv", attested_by: PRIYA } },
  manual: { source: "Added by the account team", proof: { method: "manual", note: "Existing client relationship" } },
};

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
];
const ipFor = (n) => `${n % 2 ? "203.0.113" : "198.51.100"}.${10 + ((n * 37) % 230)}`;

const iso = (ms) => new Date(ms).toISOString();
const ago = (days) => Date.now() - days * DAY;

const row = (id, createdAt, extra) => ({
  id,
  project_id: PROJECT_ID,
  metadata: {},
  created_by: PRIYA,
  created_at: createdAt,
  updated_at: createdAt,
  deleted_at: null,
  ...extra,
});

// Tag catalog --------------------------------------------------------------------
// "webinar-q3" is used on contacts but deliberately left out of the catalog.

const TAGS = [
  ["client", "emerald", "Decision makers at current Halcyon clients.", 410],
  ["prospect", "blue", "In an open new-business conversation.", 380],
  ["vip", "amber", "Top clients and repeat buyers — invite first, never discount-blast.", 360],
  ["summit-2026", "violet", "Registered for the Halcyon Creative Summit in Lisbon.", 210],
  ["speaker", "violet", "Speaking at the summit.", 205],
  ["kestrel-aero", "blue", "On the Kestrel Aero pre-order waitlist.", 150],
  ["press", "amber", "Journalists and editors — case-study announcements only.", 140],
  ["lisbon", "zinc", "Based in or near Lisbon.", 300],
  ["brooklyn", "zinc", "Based in or near Brooklyn.", 300],
  ["team", "zinc", "Halcyon staff on the internal test sends.", 420],
];

function tagRows() {
  return TAGS.map(([name, color, description, created], i) => row(aid("tag", i + 1), daysAgo(created), { name, color, description }));
}

// Custom fields -----------------------------------------------------------------

const SENIORITY = ["Individual contributor", "Manager", "Director", "VP", "C-level"];
const INDUSTRIES = ["Agency", "Consumer goods", "Education", "Financial services", "Food & beverage", "Healthcare", "Hospitality", "Mobility", "Retail", "Software"];

const FIELDS = [
  ["company", "Company", "text", [], false, "Employer or studio name."],
  ["job_title", "Job title", "text", [], false, ""],
  ["seniority", "Seniority", "select", SENIORITY, false, "Used by lead scoring and the decision-maker segment."],
  ["industry", "Industry", "select", INDUSTRIES, false, ""],
  ["city", "City", "text", [], false, ""],
  ["summit_ticket", "Summit ticket", "select", ["Early bird", "Standard", "VIP"], false, "Ticket tier for the Creative Summit."],
  ["birthday", "Birthday", "date", [], false, "Drives the birthday automation."],
  ["current_client", "Current client", "boolean", [], false, "Has an active Halcyon engagement."],
];

function customFieldRows() {
  return FIELDS.map(([key, label, type, options, required, description], i) =>
    row(aid("custom_field", i + 1), daysAgo(400 - i * 9), { key, label, type, options, required, description, position: i }),
  );
}

// Lead scoring rules --------------------------------------------------------------

const RULES = [
  { name: "Opened an email", trigger: "email_opened", points: 6, frequency: "every", decay_days: 60 },
  { name: "Clicked an email link", trigger: "email_clicked", points: 12, frequency: "every", decay_days: 90 },
  { name: "Placed an order", trigger: "event", event_name: "order_completed", points: 25, frequency: "every", decay_days: 120 },
  { name: "Submitted a form", trigger: "event", event_name: "form_submitted", points: 15, frequency: "once", decay_days: null },
  { name: "Came back to the site", trigger: "event", event_name: "page_viewed", points: 2, frequency: "every", decay_days: 14 },
  { name: "Decision maker", trigger: "attribute", condition: { field: "attributes.seniority", operator: "in", value: ["Director", "VP", "C-level"] }, points: 20, frequency: "every", decay_days: null },
  { name: "Tagged VIP", trigger: "attribute", condition: { field: "tags", operator: "has", value: "vip" }, points: 15, frequency: "every", decay_days: null },
  { name: "Unsubscribed", trigger: "attribute", condition: { field: "status", operator: "eq", value: "unsubscribed" }, points: -50, frequency: "every", decay_days: null },
  { name: "Started a checkout", trigger: "event", event_name: "checkout_started", points: 6, frequency: "every", decay_days: 7, active: false },
];

function scoringRuleRows() {
  return RULES.map((r, i) =>
    row(aid("scoring_rule", i + 1), daysAgo(150 - i * 11), {
      name: r.name,
      trigger: r.trigger,
      event_name: r.event_name ?? null,
      condition: r.condition ?? {},
      points: r.points,
      frequency: r.frequency,
      decay_days: r.decay_days,
      active: r.active !== false,
    }),
  );
}

// Contacts -----------------------------------------------------------------------

function contactRows() {
  return CONTACTS.map(([n, first, last, email, phone, city, company, title, seniority, industry, source, created, tags, extra]) => {
    const [timezone, locale] = ZONES[city] || ["Europe/Lisbon", "en-US"];
    const createdAt = daysAgo(created, between(n, 0, 9));
    const attributes = { city };
    if (company) attributes.company = company;
    if (title) attributes.job_title = title;
    if (seniority) attributes.seniority = seniority;
    if (industry) attributes.industry = industry;
    if (extra.summit) attributes.summit_ticket = extra.summit;
    if (extra.birthday) attributes.birthday = extra.birthday;
    if (extra.company) attributes.current_client = n <= 8;
    const identities = Object.fromEntries((IDENTITIES[n] || []).map((ch) => [ch, identityFor(n, ch)]));
    return {
      id: aid("contact", n),
      project_id: PROJECT_ID,
      email,
      phone,
      first_name: first,
      last_name: last,
      status: UNSUBSCRIBED[n] ? "unsubscribed" : BOUNCED[n] ? "bounced" : COMPLAINED[n] ? "complained" : "subscribed",
      source,
      tags,
      attributes,
      lead_score: 0,
      timezone,
      locale,
      company_id: extra.company ? companyId("company", COMPANY_N[extra.company]) : null,
      last_activity_at: createdAt,
      unsubscribed_at: null,
      metadata: Object.keys(identities).length ? { identities } : {},
      created_by: ["form", "event", "checkout", "sms", "instagram", "whatsapp", "messenger"].includes(source) ? null : PRIYA,
      created_at: createdAt,
      updated_at: createdAt,
      deleted_at: null,
    };
  });
}

// Lists & memberships --------------------------------------------------------------

const LISTS = [
  { n: 1, name: "Halcyon newsletter", description: "Monthly studio notes: new work, journal posts and event invites.", double_opt_in: false, created: 430, members: [2, 4, 5, 6, 7, ...span(9, 44)], source: "form" },
  { n: 2, name: "Clients", description: "Decision makers at current clients — case studies and client-only invites.", double_opt_in: false, created: 415, members: span(1, 8), source: "manual" },
  { n: 3, name: "Creative Summit 2026", description: "Registered attendees and speakers for the Lisbon summit.", double_opt_in: false, created: 210, members: [2, 5, 9, 10, 11, 15, 26, 27, 34, 36, 40, 43, 46], source: "event" },
  { n: 4, name: "Kestrel Aero waitlist", description: "Pre-order waitlist for the Kestrel Aero e-bike, confirmed by double opt-in.", double_opt_in: true, created: 155, members: [12, 16, 25, 30, 32, 38, 45, 47], source: "form", pending: [12, 25] },
];

function span(from, to) {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

function listRows() {
  return LISTS.map((l) => row(aid("list", l.n), daysAgo(l.created), { name: l.name, description: l.description, double_opt_in: l.double_opt_in }));
}

function memberRows(contacts) {
  const byN = (n) => contacts[n - 1];
  const rows = [];
  for (const list of LISTS) {
    for (const n of list.members) {
      const c = byN(n);
      const joined = Math.max(Date.parse(c.created_at), ago(list.created)) + between(n * list.n, 0, 72) * 3_600_000;
      const left = UNSUBSCRIBED[n] || COMPLAINED[n];
      const status = list.pending?.includes(n) ? "pending" : left ? "unsubscribed" : "subscribed";
      rows.push({
        id: aid("list_member", rows.length + 1),
        project_id: PROJECT_ID,
        list_id: aid("list", list.n),
        contact_id: c.id,
        status,
        source: n >= 45 ? c.source : list.source,
        metadata: status === "pending" ? { confirmation_sent_at: iso(joined) } : {},
        created_by: c.created_by,
        created_at: iso(Math.min(joined, Date.now() - DAY)),
        updated_at: iso(Math.min(joined, Date.now() - DAY)),
        deleted_at: null,
      });
    }
  }
  return rows;
}

// Consent ledger ------------------------------------------------------------------

function consentRows(contacts, leftAt) {
  const rows = [];
  const push = (c, n, channel, status, at, source, proof) =>
    rows.push({
      id: aid("contact_consent", rows.length + 1),
      project_id: PROJECT_ID,
      contact_id: c.id,
      channel,
      status,
      source,
      proof,
      ip: proof.method === "manual" || proof.method === "import" ? null : ipFor(n * channel.length),
      user_agent: proof.method === "manual" || proof.method === "import" ? null : USER_AGENTS[(n + channel.length) % USER_AGENTS.length],
      captured_at: iso(at),
      metadata: {},
      created_by: proof.method === "manual" || proof.method === "import" ? PRIYA : null,
      created_at: iso(at),
      updated_at: iso(at),
      deleted_at: null,
    });

  contacts.forEach((c, i) => {
    const n = i + 1;
    const joined = Date.parse(c.created_at);
    if (c.email) {
      const s = EMAIL_SOURCE[c.source] || EMAIL_SOURCE.manual;
      push(c, n, "email", "opted_in", joined + 60_000, s.source, s.proof);
    }
    for (const [channel, people] of Object.entries(OPT_INS)) {
      if (!people.includes(n)) continue;
      const s = CHANNEL_SOURCE[channel];
      const at = n >= 45 ? joined + 30_000 : joined + between(n * channel.length, 3, 40) * DAY;
      push(c, n, channel, "opted_in", Math.min(at, Date.now() - 2 * DAY), s.source, s.proof);
    }
    for (const channel of IDENTITIES[n] || []) {
      const s = CHANNEL_SOURCE[channel];
      const at = n >= 45 ? joined + 15_000 : joined + between(n * channel.length * 3, 5, 60) * DAY;
      push(c, n, channel, "opted_in", Math.min(at, Date.now() - 2 * DAY), s.source, s.proof);
    }
  });

  for (const o of OPT_OUTS) push(contacts[o.n - 1], o.n, o.channel, "opted_out", ago(o.days), o.source, o.proof);
  for (const p of PENDING) push(contacts[p.n - 1], p.n, p.channel, "pending", ago(p.days), p.source, p.proof);
  for (const [n, at] of leftAt) {
    const complaint = Boolean(COMPLAINED[n]);
    push(
      contacts[n - 1],
      n,
      "email",
      "opted_out",
      at,
      complaint ? "Spam complaint (feedback loop)" : "Unsubscribe link",
      { method: complaint ? "complaint" : "unsubscribe_link", campaign_id: aid("campaign", UNSUBSCRIBED[n] || COMPLAINED[n]) },
    );
  }
  return rows;
}

// Suppressions -----------------------------------------------------------------------

function suppressionRows(contacts, leftAt, bouncedAt) {
  const rows = [];
  const add = (createdAt, fields, meta = {}) =>
    rows.push(row(aid("suppression", rows.length + 1), iso(createdAt), { kind: "email", source: "", expires_at: null, ...fields, metadata: meta, created_by: fields.created_by ?? null }));

  for (const [n, at] of leftAt) {
    const complaint = Boolean(COMPLAINED[n]);
    const campaignN = UNSUBSCRIBED[n] || COMPLAINED[n];
    add(at, { value: contacts[n - 1].email, reason: complaint ? "complaint" : "unsubscribed", source: complaint ? `Feedback loop · campaign ${campaignN}` : `Unsubscribe link · campaign ${campaignN}` });
  }
  for (const [n, at] of bouncedAt) {
    add(at, { value: contacts[n - 1].email, reason: "hard_bounce", source: `550 5.1.1 mailbox unknown · campaign ${BOUNCED[n]}` });
  }
  add(ago(9), { kind: "phone", value: contacts[26].phone, reason: "unsubscribed", source: "SMS STOP reply" });
  add(ago(186), { value: "info@trailhead-co.example", reason: "invalid", source: "Import validation · role address", created_by: PRIYA }, { note: "Role address in the Trailhead import — not a person." });
  add(ago(140), { kind: "domain", value: "rivalworks.example", reason: "manual", source: "Added by Priya Nair", created_by: PRIYA }, { note: "Competitor studio — keep them off studio notes." });
  add(ago(64), { value: "legal@meridianbank.example", reason: "manual", source: "Client request", created_by: OWNER }, { note: "Meridian legal asked for no marketing to this inbox." });
  add(ago(2), { value: contacts[27].email, reason: "manual", source: "Contact request", expires_at: daysFromNow(40), created_by: PRIYA }, { note: "Asked for a break from email until the new year." });
  return rows;
}

// Engines over the delivery history ------------------------------------------------------

function lastActivity(contact, deliveries, events) {
  let latest = Date.parse(contact.created_at);
  for (const d of deliveries) for (const t of [d.opened_at, d.clicked_at]) if (t) latest = Math.max(latest, Date.parse(t));
  for (const e of events) latest = Math.max(latest, Date.parse(e.occurred_at));
  return iso(latest);
}

const SEGMENTS = [
  { n: 1, name: "Engaged in the last 60 days", description: "Opened at least two emails recently.", match: "all", conditions: [{ id: "c1", field: "engagement.opened", operator: "performed", value: { count: 2, days: 60 } }], created: 120 },
  { n: 2, name: "Hot leads", description: "Lead score of 75 or more — hand to new business.", match: "all", conditions: [{ id: "c1", field: "leadScore", operator: "gte", value: 75 }], created: 110 },
  {
    n: 3,
    name: "Lisbon & Porto",
    description: "Everyone near the Lisbon studio, for local events.",
    match: "any",
    conditions: [
      { id: "c1", field: "timezone", operator: "eq", value: "Europe/Lisbon" },
      { id: "c2", field: "attributes.city", operator: "eq", value: "Porto" },
    ],
    created: 95,
  },
  {
    n: 4,
    name: "Summit 2026 attendees",
    description: "On the summit list or tagged as attending.",
    match: "any",
    conditions: [
      { id: "c1", field: "lists", operator: "in_list", value: aid("list", 3) },
      { id: "c2", field: "tags", operator: "has", value: "summit-2026" },
    ],
    created: 80,
  },
  {
    n: 5,
    name: "Lapsed subscribers",
    description: "Subscribed for 60+ days but no opens in the last 45 — candidates for a win-back.",
    match: "all",
    conditions: [
      { id: "c1", field: "status", operator: "eq", value: "subscribed" },
      { id: "c2", field: "engagement.opened", operator: "not_performed", value: { count: 1, days: 45 } },
      { id: "c3", field: "createdAt", operator: "older_than_days", value: 60 },
    ],
    created: 60,
  },
  {
    n: 6,
    name: "Decision makers",
    description: "Directors and above who are still subscribed.",
    match: "all",
    conditions: [
      { id: "c1", field: "attributes.seniority", operator: "in", value: ["Director", "VP", "C-level"] },
      { id: "c2", field: "status", operator: "eq", value: "subscribed" },
    ],
    created: 40,
  },
];

export function audienceSeed() {
  const contacts = contactRows();
  const members = memberRows(contacts);
  const rules = scoringRuleRows();

  // The Delivery engine seed is deterministic, so this is exactly the history the playground holds.
  const history = deliveriesSeed({ contacts });
  const leftAt = [];
  const bouncedAt = [];
  for (const d of history.deliveries) {
    const n = Number(d.contact_id.slice(-12));
    if (d.unsubscribed_at && (UNSUBSCRIBED[n] || COMPLAINED[n])) leftAt.push([n, Date.parse(d.unsubscribed_at)]);
    if (d.bounced_at && BOUNCED[n]) bouncedAt.push([n, Date.parse(d.bounced_at)]);
  }

  const now = Date.now();
  const contextFor = buildContextIndex({ listMembers: members, events: history.tracked_events, deliveries: history.deliveries, now });
  for (const [n, at] of leftAt) {
    const c = contacts[n - 1];
    c.unsubscribed_at = iso(at);
    c.updated_at = iso(at);
  }
  for (const [n, at] of bouncedAt) contacts[n - 1].updated_at = iso(at);
  for (const c of contacts) {
    const ctx = contextFor(c.id);
    c.last_activity_at = lastActivity(c, ctx.deliveries, ctx.events);
    c.lead_score = scoreContact(toContactModel(c), rules.filter((r) => r.active), ctx, now).score;
  }

  const models = contacts.map(toContactModel);
  const segments = SEGMENTS.map((s) =>
    row(aid("segment", s.n), daysAgo(s.created), {
      name: s.name,
      description: s.description,
      match: s.match,
      conditions: s.conditions,
      contact_count: filterBySegment(models, s, contextFor).length,
      computed_at: hoursAgo(2 + s.n * 3),
      updated_at: daysAgo(Math.max(1, s.created - 20)),
    }),
  );

  return {
    contacts,
    lists: listRows(),
    list_members: members,
    segments,
    tags: tagRows(),
    custom_fields: customFieldRows(),
    contact_consents: consentRows(contacts, leftAt),
    suppressions: suppressionRows(contacts, leftAt, bouncedAt),
    scoring_rules: rules,
  };
}
