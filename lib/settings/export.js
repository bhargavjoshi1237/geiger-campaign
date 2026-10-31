// Workspace data export (server-only): every project-owned table the caller can read under RLS, as one JSON
// document with a manifest of row counts. Provider secrets are never included (channel_secrets has no
// client policy and isn't listed). Optional tables from other areas are skipped when they don't exist.

const PAGE = 1000;
const MAX_ROWS = 50_000;

// [table, order column]
const CORE_TABLES = [
  ["workspace_settings", "created_at"],
  ["contacts", "created_at"],
  ["lists", "created_at"],
  ["list_members", "created_at"],
  ["segments", "created_at"],
  ["campaigns", "created_at"],
  ["deliveries", "created_at"],
  ["tracked_events", "occurred_at"],
  ["channel_connections", "created_at"],
  ["conversations", "created_at"],
  ["conversation_messages", "created_at"],
  ["ai_generations", "created_at"],
];

const OPTIONAL_TABLES = [
  ["brand_kits", "created_at"],
  ["custom_fields", "created_at"],
  ["contact_consents", "created_at"],
  ["message_templates", "created_at"],
  ["assets", "created_at"],
];

async function readTable(db, projectId, table, orderBy) {
  const rows = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .eq("project_id", projectId)
      .order(orderBy, { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { rows, error: error.message };
    rows.push(...(data || []));
    if (!data || data.length < PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

export async function exportWorkspace(db, projectId, { now = new Date() } = {}) {
  const tables = {};
  const manifest = [];
  for (const [table, orderBy] of [...CORE_TABLES, ...OPTIONAL_TABLES]) {
    const optional = OPTIONAL_TABLES.some(([t]) => t === table);
    const { rows, truncated, error } = await readTable(db, projectId, table, orderBy);
    if (error) {
      if (!optional) manifest.push({ table, rows: rows.length, error });
      continue;
    }
    tables[table] = rows;
    manifest.push({ table, rows: rows.length, truncated: Boolean(truncated) });
  }
  return {
    format: "geiger-campaign-export",
    version: 1,
    projectId,
    exportedAt: now.toISOString(),
    rowLimitPerTable: MAX_ROWS,
    manifest,
    tables,
  };
}
