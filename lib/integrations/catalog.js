// The Apps catalog (pure config, client-safe). `kind` says how an app connects:
//   native      — a real connection held in campaign.integrations (credentials server-side)
//   webhook     — works through outgoing webhooks + API keys; "in use" is detected from endpoint hosts
//   commerce    — connected from the Commerce area (link target = sidebar tab)
//   unavailable — not built yet; shown honestly with the workaround

export const APP_CATEGORIES = ["Notifications", "Automation", "E-commerce", "CRM", "Productivity"];

export const APP_CATALOG = [
  {
    key: "slack",
    name: "Slack",
    category: "Notifications",
    kind: "native",
    description: "Post to a Slack channel when contacts sign up, campaigns send, orders land or conversations start.",
    provides: ["Channel notifications for the events you choose", "A test message to check the connection"],
  },
  {
    key: "zapier",
    name: "Zapier",
    category: "Automation",
    kind: "webhook",
    hostPattern: "(^|\\.)zapier\\.com$",
    description: "Trigger Zaps from Geiger events and create contacts or events from any Zap.",
    provides: ["Triggers: a webhook endpoint pointed at a Catch Hook", "Actions: Webhooks by Zapier calling the Geiger API with a secret key"],
  },
  {
    key: "make",
    name: "Make",
    category: "Automation",
    kind: "webhook",
    hostPattern: "(^|\\.)(make\\.com|integromat\\.com)$",
    description: "Start Make scenarios from Geiger events and write contacts and events back with the HTTP module.",
    provides: ["Triggers: a webhook endpoint pointed at a Custom webhook", "Actions: the HTTP module calling the Geiger API with a secret key"],
  },
  {
    key: "shopify",
    name: "Shopify",
    category: "E-commerce",
    kind: "commerce",
    tab: "Stores",
    description: "Customers, orders and abandoned carts for flows and revenue reporting.",
    provides: ["Connected from Commerce → Stores", "Orders and carts arrive as tracked events and webhooks"],
  },
  {
    key: "google_sheets",
    name: "Google Sheets",
    category: "Productivity",
    kind: "unavailable",
    description: "Append contacts or events to a spreadsheet.",
    workaround: "Use a Zapier or Make scenario on a webhook, or a download sync from Warehouse Sync.",
  },
  {
    key: "hubspot",
    name: "HubSpot",
    category: "CRM",
    kind: "unavailable",
    description: "Two-way sync of contacts and lifecycle stages.",
    workaround: "Import a CSV export into Contacts, or push changes through POST /api/v1/contacts.",
  },
  {
    key: "salesforce",
    name: "Salesforce",
    category: "CRM",
    kind: "unavailable",
    description: "Sync leads, contacts and campaign activity with Salesforce records.",
    workaround: "Send campaign activity out with webhooks and write contacts in with the API.",
  },
];

export function appByKey(key) {
  return APP_CATALOG.find((a) => a.key === key) || null;
}

export function hostOf(url) {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
}

// Webhook endpoints that belong to a webhook-kind app (matched on host).
export function endpointsForApp(app, endpoints) {
  if (!app?.hostPattern) return [];
  const re = new RegExp(app.hostPattern, "i");
  return (endpoints || []).filter((e) => re.test(hostOf(e.url)));
}
