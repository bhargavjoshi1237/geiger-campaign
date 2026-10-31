// DNS blocklists the monitor queries (isomorphic config + pure answer interpretation). IP lists take a
// reversed-octet query (4.3.2.1.zone), domain lists take the name (example.com.zone). SORBS is left out:
// Proofpoint retired it in 2024. Every list publishes an RFC 5782 test entry used to detect a resolver
// the list refuses to answer.

const RFC5782_IP_TEST = "127.0.0.2";
const RFC5782_DOMAIN_TEST = "test";

const SPAMHAUS_ERRORS = {
  "127.255.255.252": "Spamhaus rejected the query name.",
  "127.255.255.254": "Spamhaus refuses queries from public resolvers. Set SPAMHAUS_DQS_KEY or DELIVERABILITY_DNS_SERVERS.",
  "127.255.255.255": "Spamhaus rate-limited this resolver.",
};

const ZEN_CODES = {
  "127.0.0.2": "SBL: a known spam source or spam operation",
  "127.0.0.3": "SBL CSS: snowshoe spam from this IP",
  "127.0.0.4": "XBL: an infected or exploited host",
  "127.0.0.5": "XBL: an infected or exploited host",
  "127.0.0.6": "XBL: an infected or exploited host",
  "127.0.0.7": "XBL: an infected or exploited host",
  "127.0.0.9": "DROP: a hijacked or criminal network",
  "127.0.0.10": "PBL: the ISP says this range shouldn't send mail directly",
  "127.0.0.11": "PBL: a dynamic or residential range that shouldn't send mail directly",
};

const DBL_CODES = {
  "127.0.1.2": "Spam domain",
  "127.0.1.4": "Phishing domain",
  "127.0.1.5": "Malware domain",
  "127.0.1.6": "Botnet command-and-control domain",
  "127.0.1.102": "Abused legitimate domain used in spam",
  "127.0.1.103": "Abused redirector or URL shortener",
  "127.0.1.104": "Abused legitimate domain used in phishing",
  "127.0.1.105": "Abused legitimate domain serving malware",
  "127.0.1.106": "Abused legitimate domain used for botnet C&C",
};

const lastOctet = (a) => Number(String(a).split(".")[3]) || 0;

function bitmaskLabels(codes, bits) {
  const mask = codes.reduce((m, c) => m | lastOctet(c), 0);
  return Object.entries(bits).filter(([bit]) => mask & Number(bit)).map(([, label]) => label);
}

const spamhausError = (codes) => codes.map((c) => SPAMHAUS_ERRORS[c]).find(Boolean) || null;

export const IP_BLOCKLISTS = [
  {
    zone: "zen.spamhaus.org",
    dqsZone: "zen.dq.spamhaus.net",
    name: "Spamhaus ZEN",
    delistUrl: "https://check.spamhaus.org/",
    guidance: "Look the IP up on Spamhaus, fix the cause it names (compromised account, list hygiene, open relay), then request removal. PBL listings on a provider IP mean the provider must correct its range.",
    interpret: (codes) => {
      const err = spamhausError(codes);
      if (err) return { status: "error", detail: err };
      return { status: "listed", detail: codes.map((c) => ZEN_CODES[c] || c).join("; ") };
    },
  },
  {
    zone: "b.barracudacentral.org",
    name: "Barracuda",
    delistUrl: "https://www.barracudacentral.org/rbl/removal-request",
    guidance: "Submit a removal request with the IP and a contact email; Barracuda reviews within 12 hours. Unregistered resolvers may get no answer at all.",
  },
  {
    zone: "bl.spamcop.net",
    name: "SpamCop",
    delistUrl: "https://www.spamcop.net/bl.shtml",
    guidance: "SpamCop listings expire on their own about 24 hours after the last spam report. Find which campaign drew the reports and stop sending to the complaining segment.",
  },
  {
    zone: "psbl.surriel.com",
    name: "PSBL",
    delistUrl: "https://psbl.org/",
    guidance: "PSBL lists IPs that hit its spam traps. Remove the IP with the self-service form, then clean old or purchased addresses from your lists.",
  },
];

export const DOMAIN_BLOCKLISTS = [
  {
    zone: "dbl.spamhaus.org",
    dqsZone: "dbl.dq.spamhaus.net",
    name: "Spamhaus DBL",
    delistUrl: "https://check.spamhaus.org/",
    guidance: "The DBL lists domains seen in spam message bodies. Check every link and image host in your templates, then request removal from Spamhaus.",
    interpret: (codes) => {
      const err = spamhausError(codes);
      if (err) return { status: "error", detail: err };
      if (codes.includes("127.0.1.255")) return { status: "error", detail: "The DBL was queried with an IP address." };
      return { status: "listed", detail: codes.map((c) => DBL_CODES[c] || c).join("; ") };
    },
  },
  {
    zone: "multi.uribl.com",
    name: "URIBL",
    delistUrl: "https://admin.uribl.com/",
    guidance: "URIBL lists domains found in spam. Request removal from the URIBL lookup page once the domain no longer appears in unsolicited mail.",
    interpret: (codes) => {
      if (codes.includes("127.0.0.1")) return { status: "error", detail: "URIBL refused the query; the resolver is blocked for excessive use." };
      const labels = bitmaskLabels(codes, { 2: "black (confirmed spam)", 4: "grey (bulk sender)", 8: "red (monitored)" });
      return { status: "listed", detail: labels.join("; ") || codes.join(", ") };
    },
  },
  {
    zone: "multi.surbl.org",
    name: "SURBL",
    delistUrl: "https://www.surbl.org/surbl-analysis",
    guidance: "SURBL lists domains seen in spam, phishing or malware. Look the domain up on SURBL to see which list and request a review.",
    interpret: (codes) => {
      if (codes.includes("127.0.0.1")) return { status: "error", detail: "SURBL refused the query; the resolver is blocked." };
      const labels = bitmaskLabels(codes, { 8: "phishing", 16: "malware", 64: "abuse", 128: "cracked site" });
      return { status: "listed", detail: labels.join("; ") || codes.join(", ") };
    },
  },
];

export const ALL_BLOCKLISTS = [...IP_BLOCKLISTS, ...DOMAIN_BLOCKLISTS];

export function blocklistFor(zone) {
  return ALL_BLOCKLISTS.find((l) => l.zone === zone) || null;
}

export function reverseIpv4(ip) {
  return String(ip).trim().split(".").reverse().join(".");
}

// The query name for a value on a list; DQS (Spamhaus Data Query Service) when a key is configured.
export function queryName(list, value, { kind, dqsKey = "" } = {}) {
  const zone = dqsKey && list.dqsZone ? `${dqsKey}.${list.dqsZone}` : list.zone;
  return kind === "ip" ? `${reverseIpv4(value)}.${zone}` : `${String(value).toLowerCase()}.${zone}`;
}

export function testQueryName(list, { kind, dqsKey = "" } = {}) {
  return queryName(list, kind === "ip" ? RFC5782_IP_TEST : RFC5782_DOMAIN_TEST, { kind, dqsKey });
}

// A blocklist answer -> { status: clear | listed | error, detail }.
export function interpretAnswer(list, { answers = [], error = null } = {}) {
  if (error === "missing" || (!error && !answers.length)) return { status: "clear", detail: "Not listed.", codes: [] };
  if (error) return { status: "error", detail: `Lookup failed (${error}).`, codes: [] };
  const codes = answers.map(String).filter((a) => a.startsWith("127."));
  if (!codes.length) return { status: "error", detail: `Unexpected answer ${answers.join(", ")}; the list may be misconfigured.`, codes: [] };
  const result = list.interpret ? list.interpret(codes) : { status: "listed", detail: `Listed (${codes.join(", ")}).` };
  return { ...result, codes };
}
