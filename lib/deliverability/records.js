// DNS record templates for sending domains (isomorphic, pure). Email leaves through geiger-dash's
// provider, so a domain publishes that provider's records: Resend-style DKIM, a return-path subdomain
// with SPF + bounce MX, and DMARC/BIMI on the domain itself. Edit DOMAIN_PROVIDERS to change them.

export const DOMAIN_PROVIDERS = {
  resend: {
    key: "resend",
    label: "Geiger email (Resend)",
    defaultRegion: "us-east-1",
    regions: [
      { value: "us-east-1", label: "North Virginia (us-east-1)" },
      { value: "eu-west-1", label: "Ireland (eu-west-1)" },
      { value: "sa-east-1", label: "São Paulo (sa-east-1)" },
      { value: "ap-northeast-1", label: "Tokyo (ap-northeast-1)" },
    ],
    dkimSelector: "resend",
    returnPathSubdomain: "send",
    spfInclude: "amazonses.com",
    spfAll: "~all",
    bounceMx: (region) => `feedback-smtp.${region}.amazonses.com`,
    bounceMxPriority: 10,
  },
};

export const DEFAULT_PROVIDER = "resend";

export const DMARC_POLICIES = [
  { value: "none", label: "None (monitor only)" },
  { value: "quarantine", label: "Quarantine" },
  { value: "reject", label: "Reject" },
];

export const RECORD_PURPOSES = {
  dkim: { label: "DKIM", description: "Signs every message with your domain so receivers can trust it." },
  spf: { label: "SPF", description: "Authorises the provider's servers to send on the return-path subdomain." },
  mx: { label: "Bounce MX", description: "Routes bounces and complaints back to the provider." },
  dmarc: { label: "DMARC", description: "Tells receivers what to do with mail that fails authentication." },
  bimi: { label: "BIMI", description: "Shows your logo next to authenticated mail in supporting inboxes." },
};

export function providerFor(key) {
  return DOMAIN_PROVIDERS[key] || DOMAIN_PROVIDERS[DEFAULT_PROVIDER];
}

export function regionLabel(providerKey, region) {
  return providerFor(providerKey).regions.find((r) => r.value === region)?.label || region || "";
}

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

// "Mail.Example.com." -> "mail.example.com"; null when it isn't a plausible domain name.
export function normalizeDomainName(input) {
  let value = String(input || "").trim().toLowerCase();
  value = value.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  if (value.includes("@")) value = value.split("@").pop();
  try {
    value = new URL(`http://${value}`).hostname;
  } catch {
    return null;
  }
  const labels = value.split(".");
  if (labels.length < 2 || value.length > 253) return null;
  if (!labels.every((l) => LABEL.test(l))) return null;
  if (!/^(xn--[a-z0-9-]+|[a-z]{2,63})$/.test(labels[labels.length - 1])) return null;
  return value;
}

// Common multi-label public suffixes; enough to find the organisational domain for DMARC fallback.
const MULTI_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "ltd.uk", "plc.uk",
  "com.au", "net.au", "org.au", "edu.au", "co.nz", "org.nz", "co.za",
  "co.jp", "ne.jp", "or.jp", "com.br", "com.mx", "com.ar", "com.co",
  "co.in", "net.in", "org.in", "com.sg", "com.hk", "com.tr", "com.cn",
  "co.kr", "co.il", "com.my", "com.ph", "com.pk", "com.ng", "co.id",
]);

export function organizationalDomain(domain) {
  const labels = String(domain || "").split(".");
  if (labels.length <= 2) return labels.join(".");
  const lastTwo = labels.slice(-2).join(".");
  return MULTI_SUFFIXES.has(lastTwo) ? labels.slice(-3).join(".") : lastTwo;
}

export function dmarcValue(domain, settings = {}) {
  const policy = settings.dmarcPolicy || "none";
  const rua = (settings.dmarcRua || `dmarc@${organizationalDomain(domain)}`).trim();
  const parts = ["v=DMARC1", `p=${policy}`];
  if (rua) parts.push(`rua=mailto:${rua.replace(/^mailto:/i, "")}`);
  // Relaxed SPF alignment: the provider's return path is a subdomain of the From domain.
  parts.push(`adkim=${settings.dmarcAlignment === "strict" ? "s" : "r"}`, "aspf=r");
  return parts.join("; ");
}

export function bimiValue(settings = {}) {
  const parts = ["v=BIMI1", `l=${settings.bimiLogoUrl || ""}`];
  if (settings.bimiVmcUrl) parts.push(`a=${settings.bimiVmcUrl}`);
  return parts.join("; ");
}

const formatMx = (priority, exchange) => `${priority} ${exchange}`;

// The records a domain must publish for its provider, with their expected values (found/status unset).
export function buildDomainRecords(domain, { provider = DEFAULT_PROVIDER, region, settings = {} } = {}) {
  const p = providerFor(provider);
  const reg = region || p.defaultRegion;
  const returnPath = `${p.returnPathSubdomain}.${domain}`;
  const dkimKey = String(settings.dkimKey || "").replace(/\s+/g, "").replace(/^p=/i, "");
  const records = [
    {
      key: "dkim",
      purpose: "dkim",
      type: "TXT",
      host: `${p.dkimSelector}._domainkey.${domain}`,
      expected: dkimKey ? `p=${dkimKey}` : "p=<public key issued by the provider>",
      required: true,
    },
    {
      key: "spf",
      purpose: "spf",
      type: "TXT",
      host: returnPath,
      expected: `v=spf1 include:${p.spfInclude} ${p.spfAll}`,
      required: true,
    },
    {
      key: "mx",
      purpose: "mx",
      type: "MX",
      host: returnPath,
      expected: formatMx(p.bounceMxPriority, p.bounceMx(reg)),
      priority: p.bounceMxPriority,
      required: true,
    },
    {
      key: "dmarc",
      purpose: "dmarc",
      type: "TXT",
      host: `_dmarc.${domain}`,
      expected: dmarcValue(domain, settings),
      required: false,
    },
  ];
  if (settings.bimiLogoUrl) {
    records.push({
      key: "bimi",
      purpose: "bimi",
      type: "TXT",
      host: `default._bimi.${domain}`,
      expected: bimiValue(settings),
      required: false,
    });
  }
  return records.map((r) => ({ found: [], foundHost: null, status: "pending", message: "", ...r }));
}

// Carries the last check's found values onto freshly built records so a settings change keeps history.
export function mergeRecordState(nextRecords, previous = []) {
  const byKey = new Map((previous || []).map((r) => [r.key, r]));
  return nextRecords.map((r) => {
    const prev = byKey.get(r.key);
    return prev && prev.host === r.host ? { ...r, found: prev.found || [], foundHost: prev.foundHost || null, status: prev.status || "pending", message: prev.message || "" } : r;
  });
}

// The DNS host label to paste into a DNS provider that appends the zone itself ("send" for send.x.com).
export function relativeHost(host, zone) {
  if (!zone || host === zone) return "@";
  return host.endsWith(`.${zone}`) ? host.slice(0, -(zone.length + 1)) : host;
}
