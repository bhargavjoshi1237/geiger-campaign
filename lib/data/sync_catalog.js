// Warehouse sync options (pure, client-safe). Only destinations marked `supported` can be created; the rest
// are listed so the roadmap is visible, not faked.

export const SYNC_SOURCES = [
  { value: "contacts", label: "Contacts", description: "Every contact field, tags and custom attributes." },
  { value: "events", label: "Tracked events", description: "Behaviour from the snippet, API, forms, email and commerce." },
  { value: "deliveries", label: "Deliveries", description: "One row per message sent on any channel, with engagement." },
  { value: "orders", label: "Orders", description: "Orders from connected stores (Commerce)." },
];

export const SYNC_DESTINATIONS = [
  { value: "webhook", label: "Webhook", supported: true, description: "POST signed JSON batches of new and changed rows to your endpoint." },
  { value: "download", label: "File download", supported: true, description: "Export the full table as CSV or JSON Lines on demand." },
  { value: "postgres", label: "PostgreSQL", supported: false, description: "Not available yet — use a webhook into your loader for now." },
  { value: "bigquery", label: "BigQuery", supported: false, description: "Not available yet — use a webhook into your loader for now." },
  { value: "snowflake", label: "Snowflake", supported: false, description: "Not available yet — use a webhook into your loader for now." },
  { value: "s3", label: "Amazon S3", supported: false, description: "Not available yet — use a file download for now." },
];

export const SYNC_SCHEDULES = [
  { value: "manual", label: "Manual", ms: null },
  { value: "hourly", label: "Hourly", ms: 3_600_000 },
  { value: "daily", label: "Daily", ms: 86_400_000 },
  { value: "weekly", label: "Weekly", ms: 604_800_000 },
];

export const EXPORT_FORMATS = [
  { value: "csv", label: "CSV" },
  { value: "jsonl", label: "JSON Lines" },
];

export const DEFAULT_BATCH_SIZE = 500;
export const MAX_BATCH_SIZE = 1000;

export function syncSource(value) {
  return SYNC_SOURCES.find((s) => s.value === value) || SYNC_SOURCES[0];
}

export function syncDestination(value) {
  return SYNC_DESTINATIONS.find((d) => d.value === value) || SYNC_DESTINATIONS[0];
}

export function scheduleMs(value) {
  return SYNC_SCHEDULES.find((s) => s.value === value)?.ms ?? null;
}
