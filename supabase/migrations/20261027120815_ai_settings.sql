-- AI assistant & workspace settings
--
-- Owns campaign.workspace_settings (one row per project: general, sending, tracking, advanced and billing
-- sections read by lib/settings/server.js) and campaign.ai_generations (history of every AI assistant
-- output, reusable from the AI screens). Also owns campaign.workspace_settings_guard(): billing changes
-- need campaign.billing.manage, every other section needs campaign.settings.manage.

-- @up
create extension if not exists pgcrypto;

create schema if not exists campaign;
grant usage on schema campaign to anon, authenticated, service_role;

create or replace function campaign.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Workspace settings ----------------------------------------------------------

create table if not exists campaign.workspace_settings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  -- { name, timezone, locale, currency }
  general jsonb not null default '{}'::jsonb,
  -- { fromName, fromEmail, replyTo, quietHours: { start, end } | null, weeklyFrequencyCap }
  sending jsonb not null default '{}'::jsonb,
  -- { opens, clicks, linkDomain }
  tracking jsonb not null default '{}'::jsonb,
  -- { doubleOptInDefault, retentionMonths }
  advanced jsonb not null default '{}'::jsonb,
  -- { plan, interval, cycleAnchorDay, changedAt, changedBy } — no payment provider is wired.
  billing jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table campaign.workspace_settings add column if not exists advanced jsonb not null default '{}'::jsonb;
alter table campaign.workspace_settings add column if not exists billing jsonb not null default '{}'::jsonb;

create index if not exists workspace_settings_project_idx
  on campaign.workspace_settings (project_id, created_at desc)
  where deleted_at is null;

select campaign.apply_standard_access('workspace_settings', 'campaign.settings.manage');

-- Either key may write the row; the guard trigger below decides which sections each key may change.
drop policy if exists workspace_settings_write on campaign.workspace_settings;
create policy workspace_settings_write on campaign.workspace_settings for all to authenticated
  using (
    campaign.rbac_allows('campaign.settings.manage', project_id)
    or campaign.rbac_allows('campaign.billing.manage', project_id)
  )
  with check (
    campaign.rbac_allows('campaign.settings.manage', project_id)
    or campaign.rbac_allows('campaign.billing.manage', project_id)
  );

-- Section-level authorization: billing needs campaign.billing.manage, the rest campaign.settings.manage.
-- The service role (server routes, workers) has no auth.uid() and is trusted.
create or replace function campaign.workspace_settings_guard()
returns trigger
language plpgsql
security invoker
set search_path = public, campaign
as $$
declare
  billing_changed boolean;
  settings_changed boolean;
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    billing_changed := new.billing is distinct from '{}'::jsonb;
    settings_changed := (new.general, new.sending, new.tracking, new.advanced)
      is distinct from ('{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb);
  else
    billing_changed := new.billing is distinct from old.billing;
    settings_changed := (new.general, new.sending, new.tracking, new.advanced)
      is distinct from (old.general, old.sending, old.tracking, old.advanced);
  end if;

  if billing_changed and not campaign.rbac_allows('campaign.billing.manage', new.project_id) then
    raise exception 'Changing the plan needs the campaign.billing.manage permission.' using errcode = '42501';
  end if;
  if settings_changed and not campaign.rbac_allows('campaign.settings.manage', new.project_id) then
    raise exception 'Changing workspace settings needs the campaign.settings.manage permission.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists workspace_settings_guard on campaign.workspace_settings;
create trigger workspace_settings_guard
before insert or update on campaign.workspace_settings
for each row execute function campaign.workspace_settings_guard();

-- AI generations ----------------------------------------------------------------

create table if not exists campaign.ai_generations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- brief | copy | subject_lines | segment | health_explain
  tool text not null,
  title text not null default '',
  -- The validated request the tool ran with.
  input jsonb not null default '{}'::jsonb,
  -- The validated, normalized model output (never the raw reply).
  output jsonb not null default '{}'::jsonb,
  model text not null default '',
  -- What the output was turned into, when it was.
  campaign_id uuid references campaign.campaigns(id) on delete set null,
  segment_id uuid references campaign.segments(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint ai_generations_tool_check check (
    tool in ('brief', 'copy', 'subject_lines', 'segment', 'health_explain')
  )
);

create index if not exists ai_generations_project_idx
  on campaign.ai_generations (project_id, created_at desc)
  where deleted_at is null;
create index if not exists ai_generations_tool_idx
  on campaign.ai_generations (project_id, tool, created_at desc)
  where deleted_at is null;

select campaign.apply_standard_access('ai_generations', 'campaign.ai.use');

-- @down
drop table if exists campaign.ai_generations cascade;
drop table if exists campaign.workspace_settings cascade;
drop function if exists campaign.workspace_settings_guard();
