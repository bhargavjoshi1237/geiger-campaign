-- Data & integrations
--
-- Owns:
--   tables     campaign.api_keys, api_key_secrets, webhook_endpoints, webhook_secrets, integrations,
--              integration_secrets, webhook_deliveries, custom_object_types, custom_object_records,
--              catalogs, catalog_items, event_definitions, tracking_identities, warehouse_syncs,
--              warehouse_sync_secrets, warehouse_sync_runs
--   functions  campaign.api_keys_guard(), campaign.recount_catalog_items(), campaign.recount_object_records(),
--              campaign.track_event_definitions(), campaign.event_counts()
--   triggers   tracked_events_definitions on campaign.tracked_events (event catalog upkeep)
-- Secrets (API key hashes, signing secrets, Slack webhook URLs) live only in *_secrets tables, which have
-- RLS on and no client policy: only the service role (server routes and the worker) reads them.

-- @up
create extension if not exists pgcrypto;

create schema if not exists campaign;
grant usage on schema campaign to anon, authenticated, service_role;

-- API keys --------------------------------------------------------------------

create table if not exists campaign.api_keys (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled key',
  -- secret (gck_live_…, server-to-server) | public (gcp_…, browser ingest only)
  kind text not null default 'secret',
  -- First 12 characters, safe to display.
  prefix text not null default '',
  -- The full key for public keys only: they are embedded in customer pages by design. Never set for secret keys.
  display_key text,
  scopes text[] not null default '{}',
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint api_keys_kind_check check (kind in ('secret', 'public')),
  constraint api_keys_display_check check (kind = 'public' or display_key is null),
  constraint api_keys_public_scopes_check check (kind = 'secret' or scopes <@ array['events:write']::text[])
);

create index if not exists api_keys_project_idx
  on campaign.api_keys (project_id, created_at desc)
  where deleted_at is null;

-- sha256(key) per key. Server-only.
create table if not exists campaign.api_key_secrets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  key_id uuid not null unique references campaign.api_keys(id) on delete cascade,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A revoked key stays revoked; rolling or re-issuing goes through the server.
create or replace function campaign.api_keys_guard()
returns trigger
language plpgsql
as $$
begin
  if old.revoked_at is not null and new.revoked_at is null then
    raise exception 'A revoked API key cannot be restored.';
  end if;
  return new;
end;
$$;

-- Webhook endpoints -------------------------------------------------------------

create table if not exists campaign.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  url text not null,
  description text not null default '',
  -- Subscribed event names (lib/webhooks/catalog.js); '*' subscribes to every event.
  events text[] not null default '{}',
  -- active | disabled
  status text not null default 'active',
  -- manual | failures
  disabled_reason text,
  -- Consecutive failed attempts; 15 disables the endpoint.
  failure_count integer not null default 0,
  -- Last four characters of the signing secret, for display.
  secret_hint text not null default '',
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint webhook_endpoints_status_check check (status in ('active', 'disabled'))
);

create index if not exists webhook_endpoints_project_idx
  on campaign.webhook_endpoints (project_id, created_at desc)
  where deleted_at is null;

-- HMAC signing secrets. During a rotation the previous secret keeps signing until previous_expires_at.
create table if not exists campaign.webhook_secrets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  endpoint_id uuid not null unique references campaign.webhook_endpoints(id) on delete cascade,
  secret text not null,
  previous_secret text,
  previous_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- App integrations ----------------------------------------------------------------

create table if not exists campaign.integrations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- App key from lib/integrations/catalog.js (slack, …)
  provider text not null,
  name text not null default '',
  -- connected | error | disconnected
  status text not null default 'disconnected',
  -- Non-secret settings ({ channel, events }). Credentials live in integration_secrets.
  config jsonb not null default '{}'::jsonb,
  failure_count integer not null default 0,
  last_success_at timestamptz,
  last_error text,
  connected_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint integrations_status_check check (status in ('connected', 'error', 'disconnected'))
);

create unique index if not exists integrations_provider_key
  on campaign.integrations (project_id, provider)
  where deleted_at is null;

create table if not exists campaign.integration_secrets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  integration_id uuid not null unique references campaign.integrations(id) on delete cascade,
  secrets jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Webhook deliveries: one row per event per target (endpoint or app), retried with backoff --

create table if not exists campaign.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  endpoint_id uuid references campaign.webhook_endpoints(id) on delete cascade,
  integration_id uuid references campaign.integrations(id) on delete cascade,
  event text not null,
  -- Shared by every delivery of the same emitted event (X-Geiger-Event-Id), so receivers can dedupe.
  event_id uuid not null default gen_random_uuid(),
  -- The full envelope that is POSTed: { id, type, created_at, project_id, data }.
  payload jsonb not null default '{}'::jsonb,
  -- queued | delivering | delivered | failed
  status text not null default 'queued',
  attempts integer not null default 0,
  next_attempt_at timestamptz default now(),
  request_url text,
  request_headers jsonb not null default '{}'::jsonb,
  response_status integer,
  -- Truncated to 2 KB.
  response_body text,
  response_ms integer,
  last_error text,
  is_test boolean not null default false,
  replay_of uuid,
  delivered_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint webhook_deliveries_status_check check (status in ('queued', 'delivering', 'delivered', 'failed')),
  constraint webhook_deliveries_target_check check (endpoint_id is not null or integration_id is not null)
);

create index if not exists webhook_deliveries_project_idx
  on campaign.webhook_deliveries (project_id, created_at desc);
create index if not exists webhook_deliveries_due_idx
  on campaign.webhook_deliveries (next_attempt_at)
  where status in ('queued', 'delivering');
create index if not exists webhook_deliveries_endpoint_idx
  on campaign.webhook_deliveries (endpoint_id, created_at desc)
  where endpoint_id is not null;
create index if not exists webhook_deliveries_integration_idx
  on campaign.webhook_deliveries (integration_id, created_at desc)
  where integration_id is not null;

-- Custom objects --------------------------------------------------------------------

create table if not exists campaign.custom_object_types (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- API name used in lookups and /api/v1/objects/<key>/records.
  key text not null,
  name text not null default 'Untitled object',
  plural_name text not null default '',
  description text not null default '',
  -- Field key shown as the record's label.
  primary_field text not null default '',
  -- [{ key, label, type, required, options }] — types in lib/data/fields.js
  fields jsonb not null default '[]'::jsonb,
  -- How many records one contact can have: one | many
  relationship text not null default 'many',
  -- Maintained by campaign.recount_object_records().
  record_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint custom_object_types_key_check check (key ~ '^[a-z][a-z0-9_]{0,62}$'),
  constraint custom_object_types_relationship_check check (relationship in ('one', 'many'))
);

create unique index if not exists custom_object_types_key
  on campaign.custom_object_types (project_id, key)
  where deleted_at is null;
create index if not exists custom_object_types_project_idx
  on campaign.custom_object_types (project_id, created_at desc)
  where deleted_at is null;

create table if not exists campaign.custom_object_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  type_id uuid not null references campaign.custom_object_types(id) on delete cascade,
  contact_id uuid references campaign.contacts(id) on delete set null,
  -- Your system's id; imports and the API upsert on (type_id, external_id).
  external_id text,
  data jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint custom_object_records_external_key unique (type_id, external_id)
);

create index if not exists custom_object_records_type_idx
  on campaign.custom_object_records (type_id, created_at desc)
  where deleted_at is null;
create index if not exists custom_object_records_contact_idx
  on campaign.custom_object_records (contact_id)
  where contact_id is not null;

-- Catalogs --------------------------------------------------------------------------

create table if not exists campaign.catalogs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- Lookup name: catalogs.<key>.<external_id>.<field>
  key text not null,
  name text not null default 'Untitled catalog',
  description text not null default '',
  -- products | content | events | locations | other
  kind text not null default 'products',
  -- [{ key, label, type, required, options }]
  fields jsonb not null default '[]'::jsonb,
  -- manual | csv | api: how items last arrived
  source text not null default 'manual',
  -- Maintained by campaign.recount_catalog_items().
  item_count integer not null default 0,
  last_imported_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint catalogs_key_check check (key ~ '^[a-z][a-z0-9_]{0,62}$'),
  constraint catalogs_kind_check check (kind in ('products', 'content', 'events', 'locations', 'other')),
  constraint catalogs_source_check check (source in ('manual', 'csv', 'api'))
);

create unique index if not exists catalogs_key
  on campaign.catalogs (project_id, key)
  where deleted_at is null;
create index if not exists catalogs_project_idx
  on campaign.catalogs (project_id, created_at desc)
  where deleted_at is null;

create table if not exists campaign.catalog_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  catalog_id uuid not null references campaign.catalogs(id) on delete cascade,
  -- SKU / slug / your id; imports and the API upsert on (catalog_id, external_id).
  external_id text not null,
  data jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint catalog_items_external_key unique (catalog_id, external_id)
);

create index if not exists catalog_items_catalog_idx
  on campaign.catalog_items (catalog_id, created_at desc)
  where deleted_at is null;

-- Statement-level recounts so a 500-row import costs one count, not 500.
create or replace function campaign.recount_catalog_items()
returns trigger
language plpgsql
security definer
set search_path = campaign, public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    update campaign.catalogs c
    set item_count = (select count(*) from campaign.catalog_items i where i.catalog_id = c.id and i.deleted_at is null)
    where c.id in (select distinct catalog_id from new_rows);
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    update campaign.catalogs c
    set item_count = (select count(*) from campaign.catalog_items i where i.catalog_id = c.id and i.deleted_at is null)
    where c.id in (select distinct catalog_id from old_rows);
  end if;
  return null;
end;
$$;

create or replace function campaign.recount_object_records()
returns trigger
language plpgsql
security definer
set search_path = campaign, public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    update campaign.custom_object_types t
    set record_count = (select count(*) from campaign.custom_object_records r where r.type_id = t.id and r.deleted_at is null)
    where t.id in (select distinct type_id from new_rows);
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    update campaign.custom_object_types t
    set record_count = (select count(*) from campaign.custom_object_records r where r.type_id = t.id and r.deleted_at is null)
    where t.id in (select distinct type_id from old_rows);
  end if;
  return null;
end;
$$;

-- Event catalog ------------------------------------------------------------------------

create table if not exists campaign.event_definitions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  description text not null default '',
  -- active | blocked (blocked names are dropped at ingest)
  status text not null default 'active',
  -- Observed property keys -> JSON type, merged on every insert.
  properties jsonb not null default '{}'::jsonb,
  sources text[] not null default '{}',
  total_count bigint not null default 0,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint event_definitions_status_check check (status in ('active', 'blocked'))
);

create unique index if not exists event_definitions_name_key
  on campaign.event_definitions (project_id, name)
  where deleted_at is null;

-- Keeps event_definitions in step with every tracked_events insert, from any source. Never blocks the insert.
create or replace function campaign.track_event_definitions()
returns trigger
language plpgsql
security definer
set search_path = campaign, public
as $$
begin
  begin
    insert into campaign.event_definitions (project_id, name, total_count, first_seen_at, last_seen_at, sources, properties)
    select
      n.project_id,
      n.name,
      count(*),
      min(n.occurred_at),
      max(n.occurred_at),
      array_agg(distinct n.source),
      coalesce((
        select jsonb_object_agg(p.key, p.kind)
        from (
          select distinct on (e.key) e.key, jsonb_typeof(e.value) as kind
          from new_rows n2, jsonb_each(case when jsonb_typeof(n2.properties) = 'object' then n2.properties else '{}'::jsonb end) e
          where n2.project_id = n.project_id and n2.name = n.name and length(e.key) <= 64
          order by e.key
        ) p
      ), '{}'::jsonb)
    from new_rows n
    group by n.project_id, n.name
    on conflict (project_id, name) where deleted_at is null do update set
      total_count = campaign.event_definitions.total_count + excluded.total_count,
      first_seen_at = least(coalesce(campaign.event_definitions.first_seen_at, excluded.first_seen_at), excluded.first_seen_at),
      last_seen_at = greatest(coalesce(campaign.event_definitions.last_seen_at, excluded.last_seen_at), excluded.last_seen_at),
      sources = (select array_agg(distinct s) from unnest(campaign.event_definitions.sources || excluded.sources) s),
      properties = campaign.event_definitions.properties || excluded.properties;
  exception when others then
    raise warning 'track_event_definitions: %', sqlerrm;
  end;
  return null;
end;
$$;

-- Per-name event and contact counts since a moment, under the caller's RLS (member read).
create or replace function campaign.event_counts(p_project uuid, p_since timestamptz)
returns table (name text, events bigint, contacts bigint)
language sql
stable
security invoker
set search_path = campaign, public
as $$
  select e.name, count(*)::bigint, count(distinct e.contact_id)::bigint
  from campaign.tracked_events e
  where e.project_id = p_project and e.occurred_at >= p_since and e.deleted_at is null
  group by e.name;
$$;

grant execute on function campaign.event_counts(uuid, timestamptz) to authenticated, service_role;

-- Anonymous visitor -> contact, written by identify() at ingest.
create table if not exists campaign.tracking_identities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  anonymous_id text not null,
  contact_id uuid not null references campaign.contacts(id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint tracking_identities_anonymous_key unique (project_id, anonymous_id)
);

create index if not exists tracking_identities_contact_idx on campaign.tracking_identities (contact_id);

-- Warehouse sync ---------------------------------------------------------------------------

create table if not exists campaign.warehouse_syncs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled sync',
  -- webhook | download (supported) · postgres | bigquery | snowflake | s3 (not yet)
  destination text not null default 'webhook',
  -- contacts | events | deliveries | orders
  source text not null default 'contacts',
  -- webhook: { url, batchSize } · download: { format: csv | jsonl }
  config jsonb not null default '{}'::jsonb,
  -- manual | hourly | daily | weekly
  schedule text not null default 'manual',
  -- active | paused
  status text not null default 'active',
  -- "<updated_at>|<id>" of the last row pushed; incremental runs resume after it.
  sync_cursor text,
  rows_synced bigint not null default 0,
  secret_hint text not null default '',
  last_run_at timestamptz,
  last_status text,
  last_error text,
  next_run_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint warehouse_syncs_destination_check check (destination in ('webhook', 'download', 'postgres', 'bigquery', 'snowflake', 's3')),
  constraint warehouse_syncs_source_check check (source in ('contacts', 'events', 'deliveries', 'orders')),
  constraint warehouse_syncs_schedule_check check (schedule in ('manual', 'hourly', 'daily', 'weekly')),
  constraint warehouse_syncs_status_check check (status in ('active', 'paused'))
);

create index if not exists warehouse_syncs_project_idx
  on campaign.warehouse_syncs (project_id, created_at desc)
  where deleted_at is null;
create index if not exists warehouse_syncs_due_idx
  on campaign.warehouse_syncs (next_run_at)
  where status = 'active' and schedule <> 'manual' and deleted_at is null;

create table if not exists campaign.warehouse_sync_secrets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  sync_id uuid not null unique references campaign.warehouse_syncs(id) on delete cascade,
  secret text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists campaign.warehouse_sync_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  sync_id uuid not null references campaign.warehouse_syncs(id) on delete cascade,
  -- manual | schedule | download
  trigger text not null default 'manual',
  -- running | succeeded | failed
  status text not null default 'running',
  row_count integer not null default 0,
  batch_count integer not null default 0,
  cursor_from text,
  cursor_to text,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint warehouse_sync_runs_status_check check (status in ('running', 'succeeded', 'failed'))
);

create index if not exists warehouse_sync_runs_sync_idx
  on campaign.warehouse_sync_runs (sync_id, started_at desc);

-- Access --------------------------------------------------------------------------------------

select campaign.apply_standard_access('api_keys', 'campaign.integration.manage');
select campaign.apply_standard_access('webhook_endpoints', 'campaign.integration.manage');
select campaign.apply_standard_access('integrations', 'campaign.integration.manage');
select campaign.apply_standard_access('webhook_deliveries');
select campaign.apply_standard_access('custom_object_types', 'campaign.data.manage');
select campaign.apply_standard_access('custom_object_records', 'campaign.data.manage');
select campaign.apply_standard_access('catalogs', 'campaign.data.manage');
select campaign.apply_standard_access('catalog_items', 'campaign.data.manage');
select campaign.apply_standard_access('event_definitions', 'campaign.data.manage');
select campaign.apply_standard_access('tracking_identities');
select campaign.apply_standard_access('warehouse_syncs', 'campaign.data.manage');
select campaign.apply_standard_access('warehouse_sync_runs');

-- Rows that carry a server-held secret are created by server routes only; clients edit the safe columns.
revoke insert, update on campaign.api_keys from authenticated;
grant update (name, scopes, expires_at, revoked_at, deleted_at, metadata) on campaign.api_keys to authenticated;
revoke insert on campaign.webhook_endpoints from authenticated;
revoke insert on campaign.integrations from authenticated;
revoke insert on campaign.warehouse_syncs from authenticated;

drop trigger if exists api_keys_guard on campaign.api_keys;
create trigger api_keys_guard
before update on campaign.api_keys
for each row execute function campaign.api_keys_guard();

do $$
declare
  t text;
begin
  foreach t in array array['api_key_secrets', 'webhook_secrets', 'integration_secrets', 'warehouse_sync_secrets'] loop
    execute format('alter table campaign.%I enable row level security', t);
    execute format('revoke all on campaign.%I from anon, authenticated', t);
    execute format('grant all on campaign.%I to service_role', t);
    execute format('drop trigger if exists %I on campaign.%I', t || '_touch_updated_at', t);
    execute format(
      'create trigger %I before update on campaign.%I for each row execute function campaign.touch_updated_at()',
      t || '_touch_updated_at', t
    );
  end loop;
end;
$$;

drop trigger if exists catalog_items_recount_insert on campaign.catalog_items;
create trigger catalog_items_recount_insert
after insert on campaign.catalog_items
referencing new table as new_rows
for each statement execute function campaign.recount_catalog_items();
drop trigger if exists catalog_items_recount_update on campaign.catalog_items;
create trigger catalog_items_recount_update
after update on campaign.catalog_items
referencing old table as old_rows new table as new_rows
for each statement execute function campaign.recount_catalog_items();
drop trigger if exists catalog_items_recount_delete on campaign.catalog_items;
create trigger catalog_items_recount_delete
after delete on campaign.catalog_items
referencing old table as old_rows
for each statement execute function campaign.recount_catalog_items();

drop trigger if exists custom_object_records_recount_insert on campaign.custom_object_records;
create trigger custom_object_records_recount_insert
after insert on campaign.custom_object_records
referencing new table as new_rows
for each statement execute function campaign.recount_object_records();
drop trigger if exists custom_object_records_recount_update on campaign.custom_object_records;
create trigger custom_object_records_recount_update
after update on campaign.custom_object_records
referencing old table as old_rows new table as new_rows
for each statement execute function campaign.recount_object_records();
drop trigger if exists custom_object_records_recount_delete on campaign.custom_object_records;
create trigger custom_object_records_recount_delete
after delete on campaign.custom_object_records
referencing old table as old_rows
for each statement execute function campaign.recount_object_records();

drop trigger if exists tracked_events_definitions on campaign.tracked_events;
create trigger tracked_events_definitions
after insert on campaign.tracked_events
referencing new table as new_rows
for each statement execute function campaign.track_event_definitions();

-- @down
drop trigger if exists tracked_events_definitions on campaign.tracked_events;
drop table if exists campaign.warehouse_sync_runs cascade;
drop table if exists campaign.warehouse_sync_secrets cascade;
drop table if exists campaign.warehouse_syncs cascade;
drop table if exists campaign.tracking_identities cascade;
drop table if exists campaign.event_definitions cascade;
drop table if exists campaign.catalog_items cascade;
drop table if exists campaign.catalogs cascade;
drop table if exists campaign.custom_object_records cascade;
drop table if exists campaign.custom_object_types cascade;
drop table if exists campaign.webhook_deliveries cascade;
drop table if exists campaign.integration_secrets cascade;
drop table if exists campaign.integrations cascade;
drop table if exists campaign.webhook_secrets cascade;
drop table if exists campaign.webhook_endpoints cascade;
drop table if exists campaign.api_key_secrets cascade;
drop table if exists campaign.api_keys cascade;
drop function if exists campaign.event_counts(uuid, timestamptz);
drop function if exists campaign.track_event_definitions();
drop function if exists campaign.recount_object_records();
drop function if exists campaign.recount_catalog_items();
drop function if exists campaign.api_keys_guard();
