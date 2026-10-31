-- Automations
--
-- Workflows and journeys (one engine, kind = workflow | journey). Owns:
--   tables     campaign.automations, automation_enrollments, automation_step_logs,
--              automation_conditions, automation_goals, automation_cursors
--   functions  campaign.automation_record_system_event(), automation_contact_events(),
--              automation_list_member_events(), automations_guard_status(), automation_stats()
--   triggers   contacts_automation_events, list_members_automation_events (event-source core changes
--              into campaign.tracked_events), automations_guard_status
-- Enrollments, step logs and cursors are server-written (worker / routes on the service role) and member-readable.

-- @up
create extension if not exists pgcrypto;
create schema if not exists campaign;
grant usage on schema campaign to anon, authenticated, service_role;

-- Automations ------------------------------------------------------------------

create table if not exists campaign.automations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- workflow | journey
  kind text not null default 'workflow',
  name text not null default 'Untitled automation',
  description text not null default '',
  -- draft | active | paused | archived
  status text not null default 'draft',
  -- Entry trigger, mirrored from the graph's trigger node: { key, type, event, filters, field, offsetDays, days }
  trigger jsonb not null default '{}'::jsonb,
  -- Canvas document: { nodes: [{ id, type, position, data: { config } }], edges: [{ id, source, sourceHandle, target }] }
  graph jsonb not null default '{}'::jsonb,
  -- { reentry, exitOnGoal, quietHours, frequencyCap }
  settings jsonb not null default '{}'::jsonb,
  -- Cached rollup refreshed by the engine: { enrolled, active, waiting, completed, exited, failed, converted, updatedAt }
  stats jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint automations_kind_check check (kind in ('workflow', 'journey')),
  constraint automations_status_check check (status in ('draft', 'active', 'paused', 'archived'))
);

alter table campaign.automations add column if not exists published_at timestamptz;

create index if not exists automations_project_idx
  on campaign.automations (project_id, created_at desc)
  where deleted_at is null;
create index if not exists automations_active_idx
  on campaign.automations (project_id)
  where status = 'active' and deleted_at is null;

-- Enrollments: one contact's run through one automation ----------------------------

create table if not exists campaign.automation_enrollments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  automation_id uuid not null references campaign.automations(id) on delete cascade,
  contact_id uuid not null references campaign.contacts(id) on delete cascade,
  -- active | waiting | completed | exited | failed
  status text not null default 'active',
  current_node_id text,
  next_run_at timestamptz,
  -- Dedupe key for what enrolled the contact: event:<tracked_event id>, date:<field>:<year>, inactive:<since>, test:<uuid>
  trigger_key text,
  -- { trigger, waiting, convertedAt, goalNodeId, test, skipWaits, lastError }
  context jsonb not null default '{}'::jsonb,
  entered_at timestamptz not null default now(),
  completed_at timestamptz,
  exit_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint automation_enrollments_status_check check (status in ('active', 'waiting', 'completed', 'exited', 'failed'))
);

-- A contact is never in the same automation twice at once; re-entry only starts a new run after the last one ends.
create unique index if not exists automation_enrollments_running_key
  on campaign.automation_enrollments (automation_id, contact_id)
  where status in ('active', 'waiting') and deleted_at is null;
create unique index if not exists automation_enrollments_trigger_key
  on campaign.automation_enrollments (automation_id, contact_id, trigger_key)
  where trigger_key is not null;
create index if not exists automation_enrollments_due_idx
  on campaign.automation_enrollments (next_run_at)
  where status in ('active', 'waiting') and deleted_at is null;
create index if not exists automation_enrollments_automation_idx
  on campaign.automation_enrollments (automation_id, status);
create index if not exists automation_enrollments_contact_idx
  on campaign.automation_enrollments (contact_id, status);
create index if not exists automation_enrollments_project_idx
  on campaign.automation_enrollments (project_id, created_at desc)
  where deleted_at is null;

-- Step logs: every step an enrollment runs (append-only) ---------------------------

create table if not exists campaign.automation_step_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  automation_id uuid not null references campaign.automations(id) on delete cascade,
  enrollment_id uuid not null references campaign.automation_enrollments(id) on delete cascade,
  contact_id uuid references campaign.contacts(id) on delete set null,
  node_id text not null,
  node_type text not null default '',
  -- What happened, e.g. email.sent, wait.started, condition.yes, goal.reached
  action text not null default '',
  -- ok | waiting | deferred | skipped | failed
  status text not null default 'ok',
  detail jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint automation_step_logs_status_check check (status in ('ok', 'waiting', 'deferred', 'skipped', 'failed'))
);

create index if not exists automation_step_logs_enrollment_idx
  on campaign.automation_step_logs (enrollment_id, created_at);
create index if not exists automation_step_logs_node_idx
  on campaign.automation_step_logs (automation_id, node_id);
create index if not exists automation_step_logs_project_idx
  on campaign.automation_step_logs (project_id, created_at desc);

-- Reusable condition sets (segment_rules vocabulary) ---------------------------------

create table if not exists campaign.automation_conditions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled condition',
  description text not null default '',
  -- all | any
  match text not null default 'all',
  -- [{ id, field, operator, value }] evaluated by lib/audience/segment_rules.js
  conditions jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint automation_conditions_match_check check (match in ('all', 'any'))
);

create index if not exists automation_conditions_project_idx
  on campaign.automation_conditions (project_id, created_at desc)
  where deleted_at is null;

-- Reusable goals: a tracked event (+ property filters) within a window after entry ---------

create table if not exists campaign.automation_goals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled goal',
  description text not null default '',
  event_name text not null default '',
  -- [{ id, property, operator, value }]
  filters jsonb not null default '[]'::jsonb,
  -- Days after entering the automation the goal still counts; null = any time.
  window_days integer,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists automation_goals_project_idx
  on campaign.automation_goals (project_id, created_at desc)
  where deleted_at is null;

-- Per-project trigger cursor over tracked_events (worker bookkeeping) -------------------

create table if not exists campaign.automation_cursors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  -- Keyset position of the newest event already matched: its created_at and [id]
  last_event_at timestamptz,
  last_event_ids jsonb not null default '[]'::jsonb,
  -- Last scheduled scan (date-attribute and inactivity triggers)
  last_scan_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Access -------------------------------------------------------------------------

select campaign.apply_standard_access('automations', 'campaign.automation.edit');
select campaign.apply_standard_access('automation_conditions', 'campaign.automation.edit');
select campaign.apply_standard_access('automation_goals', 'campaign.automation.edit');
select campaign.apply_standard_access('automation_enrollments');
select campaign.apply_standard_access('automation_step_logs');
select campaign.apply_standard_access('automation_cursors');

-- Going live or pausing needs campaign.automation.publish, even through a direct client update.
-- Service-role writes (routes after their own check, the worker) carry no auth.uid() and pass.
create or replace function campaign.automations_guard_status()
returns trigger
language plpgsql
security definer
set search_path = public, campaign
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.status = 'active')
     or (tg_op = 'UPDATE' and new.status is distinct from old.status and (new.status = 'active' or old.status = 'active')) then
    if not campaign.rbac_allows('campaign.automation.publish', new.project_id) then
      raise exception 'Activating or pausing an automation needs the publish permission.' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.published_at is distinct from old.published_at
     and not campaign.rbac_allows('campaign.automation.publish', new.project_id) then
    new.published_at = old.published_at;
  end if;
  return new;
end;
$$;

drop trigger if exists automations_guard_status on campaign.automations;
create trigger automations_guard_status
before insert or update on campaign.automations
for each row execute function campaign.automations_guard_status();

-- Live rollup for one automation (RLS applies: security invoker).
create or replace function campaign.automation_stats(p_automation uuid)
returns jsonb
language sql
stable
security invoker
set search_path = campaign
as $$
  select jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'enrolled', count(*),
        'active', count(*) filter (where e.status = 'active'),
        'waiting', count(*) filter (where e.status = 'waiting'),
        'completed', count(*) filter (where e.status = 'completed'),
        'exited', count(*) filter (where e.status = 'exited'),
        'failed', count(*) filter (where e.status = 'failed'),
        'converted', count(*) filter (where e.context ? 'convertedAt')
      )
      from campaign.automation_enrollments e
      where e.automation_id = p_automation and e.deleted_at is null and not coalesce((e.context ->> 'test')::boolean, false)
    ),
    'current', coalesce((
      select jsonb_object_agg(c.current_node_id, c.n)
      from (
        select e.current_node_id, count(*) as n
        from campaign.automation_enrollments e
        where e.automation_id = p_automation and e.deleted_at is null
          and e.status in ('active', 'waiting') and e.current_node_id is not null
        group by e.current_node_id
      ) c
    ), '{}'::jsonb),
    'processed', coalesce((
      select jsonb_object_agg(p.node_id, jsonb_build_object('ok', p.ok, 'failed', p.failed, 'skipped', p.skipped))
      from (
        select l.node_id,
          count(distinct l.enrollment_id) filter (where l.status = 'ok') as ok,
          count(distinct l.enrollment_id) filter (where l.status = 'failed') as failed,
          count(distinct l.enrollment_id) filter (where l.status = 'skipped') as skipped
        from campaign.automation_step_logs l
        where l.automation_id = p_automation and l.deleted_at is null
        group by l.node_id
      ) p
    ), '{}'::jsonb)
  );
$$;

grant execute on function campaign.automation_stats(uuid) to authenticated, service_role;

-- Event-sourcing core changes -----------------------------------------------------
-- Client-side edits to contacts and list memberships become tracked events, so triggers fire no
-- matter which surface (screen, import, API, automation step) made the change.

create or replace function campaign.automation_record_system_event(
  p_project uuid,
  p_contact uuid,
  p_name text,
  p_properties jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, campaign
as $$
begin
  insert into campaign.tracked_events (project_id, contact_id, name, properties, source, occurred_at)
  values (p_project, p_contact, p_name, coalesce(p_properties, '{}'::jsonb), 'system', now());
end;
$$;

revoke all on function campaign.automation_record_system_event(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function campaign.automation_record_system_event(uuid, uuid, text, jsonb) to service_role;

create or replace function campaign.automation_contact_events()
returns trigger
language plpgsql
security definer
set search_path = public, campaign
as $$
declare
  t text;
begin
  if tg_op = 'INSERT' then
    if new.deleted_at is null then
      perform campaign.automation_record_system_event(
        new.project_id, new.id, 'contact_created', jsonb_build_object('source', new.source, 'status', new.status)
      );
      foreach t in array coalesce(new.tags, '{}'::text[]) loop
        perform campaign.automation_record_system_event(new.project_id, new.id, 'tag_added', jsonb_build_object('tag', t));
      end loop;
    end if;
    return new;
  end if;

  if new.deleted_at is not null then
    return new;
  end if;

  for t in
    select unnest(coalesce(new.tags, '{}'::text[])) except select unnest(coalesce(old.tags, '{}'::text[]))
  loop
    perform campaign.automation_record_system_event(new.project_id, new.id, 'tag_added', jsonb_build_object('tag', t));
  end loop;

  for t in
    select unnest(coalesce(old.tags, '{}'::text[])) except select unnest(coalesce(new.tags, '{}'::text[]))
  loop
    perform campaign.automation_record_system_event(new.project_id, new.id, 'tag_removed', jsonb_build_object('tag', t));
  end loop;

  if new.status = 'unsubscribed' and old.status is distinct from 'unsubscribed' then
    perform campaign.automation_record_system_event(
      new.project_id, new.id, 'unsubscribed', jsonb_build_object('previous_status', old.status)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists contacts_automation_events on campaign.contacts;
create trigger contacts_automation_events
after insert or update of tags, status on campaign.contacts
for each row execute function campaign.automation_contact_events();

create or replace function campaign.automation_list_member_events()
returns trigger
language plpgsql
security definer
set search_path = public, campaign
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'subscribed' and new.deleted_at is null then
      perform campaign.automation_record_system_event(
        new.project_id, new.contact_id, 'list_joined', jsonb_build_object('list_id', new.list_id, 'source', new.source)
      );
    end if;
    return new;
  end if;

  if new.status = 'subscribed' and new.deleted_at is null
     and (old.status is distinct from 'subscribed' or old.deleted_at is not null) then
    perform campaign.automation_record_system_event(
      new.project_id, new.contact_id, 'list_joined', jsonb_build_object('list_id', new.list_id, 'source', new.source)
    );
  elsif old.status = 'subscribed' and old.deleted_at is null
     and (new.status is distinct from 'subscribed' or new.deleted_at is not null) then
    perform campaign.automation_record_system_event(
      new.project_id, new.contact_id, 'list_left', jsonb_build_object('list_id', new.list_id, 'status', new.status)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists list_members_automation_events on campaign.list_members;
create trigger list_members_automation_events
after insert or update of status, deleted_at on campaign.list_members
for each row execute function campaign.automation_list_member_events();

-- @down
drop trigger if exists list_members_automation_events on campaign.list_members;
drop trigger if exists contacts_automation_events on campaign.contacts;
drop function if exists campaign.automation_list_member_events();
drop function if exists campaign.automation_contact_events();
drop function if exists campaign.automation_record_system_event(uuid, uuid, text, jsonb);
drop function if exists campaign.automation_stats(uuid);
drop trigger if exists automations_guard_status on campaign.automations;
drop function if exists campaign.automations_guard_status();
drop table if exists campaign.automation_cursors cascade;
drop table if exists campaign.automation_goals cascade;
drop table if exists campaign.automation_conditions cascade;
drop table if exists campaign.automation_step_logs cascade;
drop table if exists campaign.automation_enrollments cascade;
drop table if exists campaign.automations cascade;
