-- Broadcasts
--
-- Owns campaign.broadcasts (one-to-many WhatsApp/SMS/RCS sends), campaign.broadcast_recipients (the frozen,
-- consent-filtered send queue the worker paces through dispatch), campaign.broadcast_senders (sender registry:
-- WhatsApp numbers, SMS sender ids with 10DLC/toll-free registration, RCS agents, plus quality snapshots),
-- campaign.message_rates (the per-project rate card used for cost previews), campaign.message_budgets
-- (monthly spend caps) and campaign.message_spend (provider-reported spend, e.g. Meta pricing analytics).
-- Also lets campaign.broadcast.edit holders write campaign.message_templates (owned by Channels).

-- @up
create extension if not exists pgcrypto;
create schema if not exists campaign;
grant usage on schema campaign to anon, authenticated, service_role;

-- Broadcasts -------------------------------------------------------------------

create table if not exists campaign.broadcasts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled broadcast',
  -- whatsapp | sms | rcs
  channel text not null default 'whatsapp',
  -- draft | scheduled | sending | paused | sent | cancelled | failed
  status text not null default 'draft',
  connection_id uuid references campaign.channel_connections(id) on delete set null,
  -- campaign.message_templates (Channels) — plain uuid, no FK across areas.
  message_template_id uuid,
  -- { listIds, segmentIds, excludeListIds, excludeSegmentIds }
  audience jsonb not null default '{}'::jsonb,
  -- { mode: template | text, text, title, mediaUrl, buttons: [{ title, url }] }
  content jsonb not null default '{}'::jsonb,
  -- Template variable mapping: { header: [map], body: [map], buttons: { [index]: map } }, map = { source, field, value, fallback }
  variables jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz,
  -- { enabled, start, end, timezone, contactTimezone }
  quiet_hours jsonb not null default '{}'::jsonb,
  -- { maxPerHour, ramp: { enabled, startPerDay, growthPercent } }
  pacing jsonb not null default '{}'::jsonb,
  budget_cap numeric(12, 2),
  currency text not null default 'USD',
  -- Snapshot taken when the broadcast is queued: recipients, exclusions, estimated cost by country.
  estimate jsonb not null default '{}'::jsonb,
  -- Cached rollup: total, pending, sent, delivered, read, failed, notSent, skipped, cancelled, cost, estimatedCost.
  stats jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  paused_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint broadcasts_channel_check check (channel in ('whatsapp', 'sms', 'rcs')),
  constraint broadcasts_status_check check (status in ('draft', 'scheduled', 'sending', 'paused', 'sent', 'cancelled', 'failed'))
);

create index if not exists broadcasts_project_idx
  on campaign.broadcasts (project_id, created_at desc)
  where deleted_at is null;
create index if not exists broadcasts_due_idx
  on campaign.broadcasts (status, scheduled_at)
  where deleted_at is null and status in ('scheduled', 'sending');

select campaign.apply_standard_access('broadcasts', 'campaign.broadcast.edit');

-- Broadcast recipients (server-written queue) -------------------------------------

create table if not exists campaign.broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  broadcast_id uuid not null references campaign.broadcasts(id) on delete cascade,
  contact_id uuid references campaign.contacts(id) on delete set null,
  address text not null,
  -- ISO 3166-1 alpha-2 from the calling code, '' when unknown.
  country text not null default '',
  -- pending | sent | failed | not_sent | skipped | cancelled
  status text not null default 'pending',
  reason text,
  delivery_id uuid references campaign.deliveries(id) on delete set null,
  estimated_cost numeric(12, 5),
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  processed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint broadcast_recipients_status_check check (status in ('pending', 'sent', 'failed', 'not_sent', 'skipped', 'cancelled'))
);

create unique index if not exists broadcast_recipients_contact_key
  on campaign.broadcast_recipients (broadcast_id, contact_id);
create index if not exists broadcast_recipients_queue_idx
  on campaign.broadcast_recipients (broadcast_id, status, next_attempt_at);
create index if not exists broadcast_recipients_project_idx
  on campaign.broadcast_recipients (project_id, created_at desc)
  where deleted_at is null;

select campaign.apply_standard_access('broadcast_recipients');

-- Sender registry -----------------------------------------------------------------

create table if not exists campaign.broadcast_senders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  connection_id uuid references campaign.channel_connections(id) on delete set null,
  -- whatsapp | sms | rcs
  channel text not null,
  -- whatsapp_number | long_code | toll_free | short_code | alphanumeric | rcs_agent
  kind text not null,
  -- E.164 number, alphanumeric sender id, short code or RBM agent id.
  value text not null,
  label text not null default '',
  countries text[] not null default '{}',
  -- not_required | not_started | draft | submitted | approved | rejected
  registration_status text not null default 'not_started',
  -- { program, brandName, brandId, campaignId, useCase, sampleMessages, reference, submittedAt, decidedAt, rejectionReason, syncedFrom }
  registration jsonb not null default '{}'::jsonb,
  -- Provider-reported health: WhatsApp quality rating, messaging tier, throughput, name status; RCS launch state.
  health jsonb not null default '{}'::jsonb,
  health_checked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint broadcast_senders_channel_check check (channel in ('whatsapp', 'sms', 'rcs')),
  constraint broadcast_senders_kind_check check (kind in ('whatsapp_number', 'long_code', 'toll_free', 'short_code', 'alphanumeric', 'rcs_agent')),
  constraint broadcast_senders_registration_check check (
    registration_status in ('not_required', 'not_started', 'draft', 'submitted', 'approved', 'rejected')
  )
);

create unique index if not exists broadcast_senders_value_key
  on campaign.broadcast_senders (project_id, channel, value)
  where deleted_at is null;
create index if not exists broadcast_senders_project_idx
  on campaign.broadcast_senders (project_id, created_at desc)
  where deleted_at is null;

select campaign.apply_standard_access('broadcast_senders', 'campaign.broadcast.edit');

-- Rate card -----------------------------------------------------------------------

create table if not exists campaign.message_rates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- whatsapp | sms | rcs
  channel text not null,
  -- ISO 3166-1 alpha-2, or '*' for every other country.
  country text not null default '*',
  -- whatsapp: marketing | utility | authentication | service; sms: segment; rcs: basic | rich
  category text not null,
  unit_cost numeric(12, 5) not null default 0,
  currency text not null default 'USD',
  -- manual | example | provider
  source text not null default 'manual',
  notes text not null default '',
  effective_from date,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint message_rates_channel_check check (channel in ('whatsapp', 'sms', 'rcs')),
  constraint message_rates_source_check check (source in ('manual', 'example', 'provider')),
  constraint message_rates_cost_check check (unit_cost >= 0)
);

create unique index if not exists message_rates_key
  on campaign.message_rates (project_id, channel, country, category)
  where deleted_at is null;
create index if not exists message_rates_project_idx
  on campaign.message_rates (project_id, created_at desc)
  where deleted_at is null;

select campaign.apply_standard_access('message_rates', 'campaign.broadcast.edit');

-- Budget caps ---------------------------------------------------------------------

create table if not exists campaign.message_budgets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- all | whatsapp | sms | rcs
  channel text not null default 'all',
  -- month (calendar month, UTC)
  period text not null default 'month',
  cap numeric(12, 2) not null,
  currency text not null default 'USD',
  alert_percent integer not null default 80,
  -- true: broadcasts pause when the cap is reached; false: warn only.
  hard_stop boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint message_budgets_channel_check check (channel in ('all', 'whatsapp', 'sms', 'rcs')),
  constraint message_budgets_period_check check (period in ('month')),
  constraint message_budgets_cap_check check (cap >= 0),
  constraint message_budgets_alert_check check (alert_percent between 1 and 100)
);

create unique index if not exists message_budgets_channel_key
  on campaign.message_budgets (project_id, channel)
  where deleted_at is null;

select campaign.apply_standard_access('message_budgets', 'campaign.broadcast.send');

-- Provider-reported spend (server-written) ---------------------------------------------

create table if not exists campaign.message_spend (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  connection_id uuid references campaign.channel_connections(id) on delete cascade,
  channel text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  country text not null default '',
  category text not null default '',
  volume integer not null default 0,
  cost numeric(14, 5) not null default 0,
  currency text not null default 'USD',
  -- meta_pricing_analytics | twilio
  source text not null default 'meta_pricing_analytics',
  synced_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint message_spend_period_key unique (connection_id, period_start, country, category, source)
);

create index if not exists message_spend_project_idx
  on campaign.message_spend (project_id, period_start desc)
  where deleted_at is null;

select campaign.apply_standard_access('message_spend');

-- Message templates: broadcast editors may write them too (Channels' policy keeps channel.manage).

do $$
begin
  if to_regclass('campaign.message_templates') is not null then
    drop policy if exists message_templates_broadcast_write on campaign.message_templates;
    create policy message_templates_broadcast_write on campaign.message_templates for all to authenticated
      using (campaign.rbac_allows('campaign.broadcast.edit', project_id))
      with check (campaign.rbac_allows('campaign.broadcast.edit', project_id));
  end if;
end;
$$;

-- @down
do $$
begin
  if to_regclass('campaign.message_templates') is not null then
    drop policy if exists message_templates_broadcast_write on campaign.message_templates;
  end if;
end;
$$;
drop table if exists campaign.message_spend cascade;
drop table if exists campaign.message_budgets cascade;
drop table if exists campaign.message_rates cascade;
drop table if exists campaign.broadcast_senders cascade;
drop table if exists campaign.broadcast_recipients cascade;
drop table if exists campaign.broadcasts cascade;
