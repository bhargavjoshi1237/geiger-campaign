-- Delivery engine
--
-- The campaign sending pipeline's own state. Owns:
--   tables     campaign.campaign_sends (one send job per campaign launch: strategy, A/B phase, progress, lease),
--              campaign.campaign_send_recipients (the resumable per-recipient outbox: due time, variant, outcome),
--              campaign.send_time_settings (one row per project: send-time optimization defaults)
--   functions  campaign.track_delivery() (atomic open/click bookkeeping on campaign.deliveries, service role only)
-- Jobs and recipients are server-written (service role) and member-readable; send-time settings are
-- edited from the Send-Time Optimization screen under campaign.campaign.edit.

-- @up
create extension if not exists pgcrypto;

create schema if not exists campaign;
grant usage on schema campaign to anon, authenticated, service_role;

-- Send jobs ------------------------------------------------------------------

create table if not exists campaign.campaign_sends (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  campaign_id uuid not null references campaign.campaigns(id) on delete cascade,
  channel text not null default 'email',
  -- preparing | sending | waiting | paused | completed | cancelled | failed
  status text not null default 'preparing',
  -- { mode: now | scheduled | timezone | optimized, localTime, windowHours, fallbackHour, minOpens }
  strategy jsonb not null default '{}'::jsonb,
  -- { enabled, phase: testing | decided, testPercent, split, metric, windowHours, decideAt, winner, decidedAt, variants }
  ab jsonb not null default '{}'::jsonb,
  total integer not null default 0,
  sent integer not null default 0,
  failed integer not null default 0,
  skipped integer not null default 0,
  uncertain integer not null default 0,
  scheduled_for timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  -- Set when the daily send cap is reached; the worker resumes after it.
  throttled_until timestamptz,
  -- Held by the tick processing this job so two workers never send the same batch.
  lease_until timestamptz,
  last_tick_at timestamptz,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint campaign_sends_status_check check (
    status in ('preparing', 'sending', 'waiting', 'paused', 'completed', 'cancelled', 'failed')
  )
);

create index if not exists campaign_sends_project_idx
  on campaign.campaign_sends (project_id, created_at desc)
  where deleted_at is null;
create index if not exists campaign_sends_campaign_idx
  on campaign.campaign_sends (campaign_id, created_at desc);
create index if not exists campaign_sends_active_idx
  on campaign.campaign_sends (last_tick_at nulls first)
  where status in ('preparing', 'sending', 'waiting') and deleted_at is null;
-- At most one live job per campaign, so a double-clicked send can't start two.
create unique index if not exists campaign_sends_one_live_key
  on campaign.campaign_sends (campaign_id)
  where status in ('preparing', 'sending', 'waiting', 'paused') and deleted_at is null;

select campaign.apply_standard_access('campaign_sends');

-- Recipient outbox ------------------------------------------------------------

create table if not exists campaign.campaign_send_recipients (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  send_id uuid not null references campaign.campaign_sends(id) on delete cascade,
  campaign_id uuid not null references campaign.campaigns(id) on delete cascade,
  contact_id uuid not null references campaign.contacts(id) on delete cascade,
  address text not null,
  variant text,
  -- pending | held (A/B remainder awaiting the winner) | sending | sent | failed | uncertain | skipped | cancelled
  status text not null default 'pending',
  due_at timestamptz,
  claimed_at timestamptz,
  processed_at timestamptz,
  delivery_id uuid references campaign.deliveries(id) on delete set null,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint campaign_send_recipients_unique unique (send_id, contact_id),
  constraint campaign_send_recipients_status_check check (
    status in ('pending', 'held', 'sending', 'sent', 'failed', 'uncertain', 'skipped', 'cancelled')
  )
);

create index if not exists campaign_send_recipients_project_idx
  on campaign.campaign_send_recipients (project_id, created_at desc)
  where deleted_at is null;
create index if not exists campaign_send_recipients_due_idx
  on campaign.campaign_send_recipients (send_id, due_at)
  where status = 'pending';
create index if not exists campaign_send_recipients_status_idx
  on campaign.campaign_send_recipients (send_id, status);
create index if not exists campaign_send_recipients_contact_idx
  on campaign.campaign_send_recipients (contact_id);

select campaign.apply_standard_access('campaign_send_recipients');

-- Send-time optimization settings ------------------------------------------------

create table if not exists campaign.send_time_settings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- When on, campaigns without an explicit strategy send with `strategy`.
  enabled boolean not null default false,
  -- optimized | timezone
  strategy text not null default 'optimized',
  fallback_hour integer not null default 10,
  window_hours integer not null default 24,
  min_opens integer not null default 2,
  -- HH:MM wall-clock time for recipient-time-zone sends.
  local_time text not null default '09:00',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint send_time_settings_project_key unique (project_id),
  constraint send_time_settings_strategy_check check (strategy in ('optimized', 'timezone')),
  constraint send_time_settings_fallback_check check (fallback_hour between 0 and 23),
  constraint send_time_settings_window_check check (window_hours between 1 and 72),
  constraint send_time_settings_min_opens_check check (min_opens between 1 and 20),
  constraint send_time_settings_local_time_check check (local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);

create index if not exists send_time_settings_project_idx
  on campaign.send_time_settings (project_id, created_at desc)
  where deleted_at is null;

select campaign.apply_standard_access('send_time_settings', 'campaign.campaign.edit');

-- Tracking ---------------------------------------------------------------------

-- One open or click on a delivery: first-open/first-click timestamps, counters and the status
-- progression in a single locked update. A click with no prior open counts as an implied open.
create or replace function campaign.track_delivery(p_delivery_id uuid, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = campaign
as $$
declare
  prior_opened timestamptz;
  prior_clicked timestamptz;
  result jsonb;
begin
  if p_kind not in ('open', 'click') then
    raise exception 'unknown tracking kind %', p_kind;
  end if;

  select d.opened_at, d.clicked_at into prior_opened, prior_clicked
  from campaign.deliveries d
  where d.id = p_delivery_id
  for update;
  if not found then
    return null;
  end if;

  update campaign.deliveries d
  set
    opened_at = coalesce(d.opened_at, now()),
    open_count = d.open_count + case when p_kind = 'open' or prior_opened is null then 1 else 0 end,
    clicked_at = case when p_kind = 'click' then coalesce(d.clicked_at, now()) else d.clicked_at end,
    click_count = d.click_count + case when p_kind = 'click' then 1 else 0 end,
    status = case
      when d.status in ('bounced', 'complained', 'unsubscribed', 'failed', 'not_sent', 'replied') then d.status
      when p_kind = 'click' then 'clicked'
      when d.status in ('queued', 'sent', 'delivered', 'read') then 'opened'
      else d.status
    end
  where d.id = p_delivery_id
  returning jsonb_build_object(
    'project_id', d.project_id,
    'contact_id', d.contact_id,
    'campaign_id', d.campaign_id,
    'channel', d.channel,
    'source_type', d.source_type,
    'source_id', d.source_id,
    'variant', d.variant,
    'first_open', prior_opened is null,
    'first_click', p_kind = 'click' and prior_clicked is null,
    'open_count', d.open_count,
    'click_count', d.click_count
  ) into result;

  return result;
end;
$$;

revoke all on function campaign.track_delivery(uuid, text) from public, anon, authenticated;
grant execute on function campaign.track_delivery(uuid, text) to service_role;

-- @down
drop function if exists campaign.track_delivery(uuid, text);
drop table if exists campaign.send_time_settings cascade;
drop table if exists campaign.campaign_send_recipients cascade;
drop table if exists campaign.campaign_sends cascade;
