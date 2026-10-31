-- Reporting
--
-- Owns campaign.dashboards (saved widget layouts) and campaign.reports (saved report definitions with an
-- optional email schedule run by the report worker). Both are written by holders of campaign.report.edit.
-- Dashboards can be private: members read shared dashboards and their own.

-- @up
create extension if not exists pgcrypto;
create schema if not exists campaign;
grant usage on schema campaign to anon, authenticated, service_role;

-- Dashboards ------------------------------------------------------------------

create table if not exists campaign.dashboards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled dashboard',
  description text not null default '',
  -- [{ id, widget: kpi|timeseries|bar|table, metric, dimension, range, size, title }]
  layout jsonb not null default '[]'::jsonb,
  -- Default period for every widget that doesn't override it (7d, 14d, 30d, 90d, 180d, 365d).
  range text not null default '30d',
  is_default boolean not null default false,
  shared boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint dashboards_default_shared_check check (not is_default or shared)
);

create index if not exists dashboards_project_idx
  on campaign.dashboards (project_id, created_at desc)
  where deleted_at is null;
create unique index if not exists dashboards_default_key
  on campaign.dashboards (project_id)
  where is_default and deleted_at is null;

select campaign.apply_standard_access('dashboards', 'campaign.report.edit');

-- Replace the standard member-read / write pair so private dashboards stay with their creator.
drop policy if exists dashboards_member_read on campaign.dashboards;
create policy dashboards_member_read on campaign.dashboards for select to authenticated
  using (campaign.rbac_is_member(project_id) and (shared or created_by = auth.uid()));

drop policy if exists dashboards_write on campaign.dashboards;
drop policy if exists dashboards_insert on campaign.dashboards;
create policy dashboards_insert on campaign.dashboards for insert to authenticated
  with check (campaign.rbac_allows('campaign.report.edit', project_id));
drop policy if exists dashboards_update on campaign.dashboards;
create policy dashboards_update on campaign.dashboards for update to authenticated
  using (campaign.rbac_allows('campaign.report.edit', project_id) and (shared or created_by = auth.uid()))
  with check (campaign.rbac_allows('campaign.report.edit', project_id));

-- Reports ---------------------------------------------------------------------

create table if not exists campaign.reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled report',
  description text not null default '',
  -- { metric, dimension, filters: { channels, campaignIds, listIds }, range, chart, limit }
  definition jsonb not null default '{}'::jsonb,
  -- { frequency: manual|daily|weekly|monthly, hour, weekday, day, timezone, recipients: [email] }
  schedule jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  -- runs: [{ at, trigger, rows, value, sentTo }], scheduledKey: last period the worker delivered
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists reports_project_idx
  on campaign.reports (project_id, created_at desc)
  where deleted_at is null;
create index if not exists reports_scheduled_idx
  on campaign.reports ((schedule ->> 'frequency'))
  where deleted_at is null;

select campaign.apply_standard_access('reports', 'campaign.report.edit');

-- @down
drop table if exists campaign.reports cascade;
drop table if exists campaign.dashboards cascade;
