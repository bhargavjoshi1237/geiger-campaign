-- CRM
--
-- Owns campaign.companies, pipelines, deals, crm_tasks, crm_activities, plus:
--   functions  campaign.crm_stage_name(), crm_deals_before_write(), crm_deals_after_write(),
--              crm_tasks_before_write(), crm_contacts_autolink()
--   triggers   deals: won/lost timestamps, stage/status history into crm_activities and one live
--              `deal_won` tracked event per won deal (revenue = value) for attribution and automations;
--              crm_tasks: completed_at; contacts: link new contacts to the company owning their email domain.
-- Writes need campaign.crm.edit; any project member reads.

-- @up
create extension if not exists pgcrypto;

create schema if not exists campaign;
grant usage on schema campaign to anon, authenticated, service_role;

-- Companies -----------------------------------------------------------------

create table if not exists campaign.companies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled company',
  -- Bare lowercase host ("northwind.io"); contacts are matched on their email domain.
  domain text,
  industry text not null default '',
  size text not null default '',
  owner_id uuid,
  website text not null default '',
  address text not null default '',
  -- New contacts whose email domain matches are linked automatically.
  auto_associate boolean not null default true,
  attributes jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists companies_project_idx
  on campaign.companies (project_id, created_at desc)
  where deleted_at is null;
create unique index if not exists companies_project_domain_key
  on campaign.companies (project_id, lower(domain))
  where deleted_at is null and domain is not null and domain <> '';

-- Pipelines -----------------------------------------------------------------

create table if not exists campaign.pipelines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled pipeline',
  description text not null default '',
  -- [{ id, name, probability (0-100), color }] in board order. Won/lost is a deal status, not a stage.
  stages jsonb not null default '[]'::jsonb,
  is_default boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint pipelines_stages_array check (jsonb_typeof(stages) = 'array')
);

create index if not exists pipelines_project_idx
  on campaign.pipelines (project_id, created_at desc)
  where deleted_at is null;
create unique index if not exists pipelines_project_default_key
  on campaign.pipelines (project_id)
  where is_default and deleted_at is null;

-- Deals ---------------------------------------------------------------------

create table if not exists campaign.deals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  pipeline_id uuid not null references campaign.pipelines(id) on delete cascade,
  -- A stage id inside pipelines.stages.
  stage_id text not null default '',
  name text not null default 'Untitled deal',
  value numeric(14, 2) not null default 0,
  currency text not null default 'USD',
  contact_id uuid references campaign.contacts(id) on delete set null,
  company_id uuid references campaign.companies(id) on delete set null,
  owner_id uuid,
  expected_close_date date,
  -- open | won | lost
  status text not null default 'open',
  lost_reason text not null default '',
  won_at timestamptz,
  lost_at timestamptz,
  -- The campaign credited with sourcing the deal (revenue attribution).
  source_campaign_id uuid references campaign.campaigns(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint deals_status_check check (status in ('open', 'won', 'lost')),
  constraint deals_value_check check (value >= 0)
);

create index if not exists deals_project_idx
  on campaign.deals (project_id, created_at desc)
  where deleted_at is null;
create index if not exists deals_pipeline_idx
  on campaign.deals (pipeline_id, stage_id)
  where deleted_at is null;
create index if not exists deals_company_idx
  on campaign.deals (company_id)
  where company_id is not null and deleted_at is null;
create index if not exists deals_contact_idx
  on campaign.deals (contact_id)
  where contact_id is not null and deleted_at is null;

-- Tasks ---------------------------------------------------------------------

create table if not exists campaign.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null default 'Untitled task',
  notes text not null default '',
  due_at timestamptz,
  assignee_id uuid,
  -- contact | company | deal; related_id points into that table (polymorphic, so no FK).
  related_type text,
  related_id uuid,
  -- open | done
  status text not null default 'open',
  -- low | medium | high
  priority text not null default 'medium',
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint crm_tasks_status_check check (status in ('open', 'done')),
  constraint crm_tasks_priority_check check (priority in ('low', 'medium', 'high')),
  constraint crm_tasks_related_check check (related_type is null or related_type in ('contact', 'company', 'deal'))
);

create index if not exists crm_tasks_project_idx
  on campaign.crm_tasks (project_id, status, due_at)
  where deleted_at is null;
create index if not exists crm_tasks_related_idx
  on campaign.crm_tasks (related_type, related_id)
  where deleted_at is null;
create index if not exists crm_tasks_assignee_idx
  on campaign.crm_tasks (assignee_id, status)
  where deleted_at is null;

-- Activities ----------------------------------------------------------------

create table if not exists campaign.crm_activities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- note | call | meeting | email | stage_change | system
  kind text not null default 'note',
  subject text not null default '',
  body text not null default '',
  related_type text,
  related_id uuid,
  contact_id uuid references campaign.contacts(id) on delete set null,
  actor_id uuid,
  occurred_at timestamptz not null default now(),
  -- stage_change/system rows carry { event, pipelineId, fromStageId, toStageId, fromStatus, toStatus, value, … }.
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint crm_activities_kind_check check (kind in ('note', 'call', 'meeting', 'email', 'stage_change', 'system')),
  constraint crm_activities_related_check check (related_type is null or related_type in ('contact', 'company', 'deal'))
);

create index if not exists crm_activities_project_idx
  on campaign.crm_activities (project_id, occurred_at desc)
  where deleted_at is null;
create index if not exists crm_activities_related_idx
  on campaign.crm_activities (related_type, related_id, occurred_at desc)
  where deleted_at is null;
create index if not exists crm_activities_contact_idx
  on campaign.crm_activities (contact_id, occurred_at desc)
  where contact_id is not null;

-- Access ----------------------------------------------------------------------

select campaign.apply_standard_access('companies', 'campaign.crm.edit');
select campaign.apply_standard_access('pipelines', 'campaign.crm.edit');
select campaign.apply_standard_access('deals', 'campaign.crm.edit');
select campaign.apply_standard_access('crm_tasks', 'campaign.crm.edit');
select campaign.apply_standard_access('crm_activities', 'campaign.crm.edit');

-- Deal triggers -------------------------------------------------------------

-- A stage's display name inside a pipeline ('' when the stage no longer exists).
create or replace function campaign.crm_stage_name(p_pipeline uuid, p_stage text)
returns text
language sql
stable
set search_path = campaign
as $$
  select coalesce((
    select s->>'name'
    from campaign.pipelines p, jsonb_array_elements(p.stages) s
    where p.id = p_pipeline and s->>'id' = p_stage
    limit 1
  ), '');
$$;

-- Defaults a missing stage to the pipeline's first one and keeps won/lost timestamps in step with status.
create or replace function campaign.crm_deals_before_write()
returns trigger
language plpgsql
set search_path = campaign
as $$
declare
  v_stage text;
  v_status_changed boolean := true;
begin
  if coalesce(new.stage_id, '') = '' then
    select p.stages->0->>'id' into v_stage from campaign.pipelines p where p.id = new.pipeline_id;
    new.stage_id := coalesce(v_stage, '');
  end if;

  if tg_op = 'UPDATE' then
    v_status_changed := new.status is distinct from old.status;
  end if;

  if v_status_changed then
    if new.status = 'won' then
      new.won_at := coalesce(new.won_at, now());
      new.lost_at := null;
      new.lost_reason := '';
    elsif new.status = 'lost' then
      new.lost_at := coalesce(new.lost_at, now());
      new.won_at := null;
    else
      new.won_at := null;
      new.lost_at := null;
      new.lost_reason := '';
    end if;
  end if;
  return new;
end;
$$;

-- History + attribution. Security definer so it can write tracked_events (server-written, no client policy).
create or replace function campaign.crm_deals_after_write()
returns trigger
language plpgsql
security definer
set search_path = campaign, public
as $$
declare
  v_actor uuid := auth.uid();
  v_event uuid;
  v_props jsonb;
begin
  if tg_op = 'INSERT' then
    if new.deleted_at is not null then
      return null;
    end if;
    insert into campaign.crm_activities
      (project_id, kind, subject, related_type, related_id, contact_id, actor_id, occurred_at, metadata)
    values (
      new.project_id, 'system', 'Deal created', 'deal', new.id, new.contact_id,
      coalesce(v_actor, new.created_by), new.created_at,
      jsonb_build_object(
        'event', 'created',
        'pipelineId', new.pipeline_id,
        'toStageId', new.stage_id,
        'toStageName', campaign.crm_stage_name(new.pipeline_id, new.stage_id),
        'toStatus', new.status,
        'value', new.value,
        'currency', new.currency
      )
    );
  else
    -- A soft-deleted deal stops counting as revenue.
    if new.deleted_at is not null then
      if old.deleted_at is null then
        update campaign.tracked_events
        set deleted_at = now()
        where project_id = new.project_id
          and name = 'deal_won'
          and deleted_at is null
          and properties->>'dealId' = new.id::text;
      end if;
      return null;
    end if;

    if new.pipeline_id is distinct from old.pipeline_id or new.stage_id is distinct from old.stage_id then
      insert into campaign.crm_activities
        (project_id, kind, subject, related_type, related_id, contact_id, actor_id, metadata)
      values (
        new.project_id, 'stage_change',
        'Moved to ' || coalesce(nullif(campaign.crm_stage_name(new.pipeline_id, new.stage_id), ''), 'another stage'),
        'deal', new.id, new.contact_id, v_actor,
        jsonb_build_object(
          'event', 'stage',
          'fromPipelineId', old.pipeline_id,
          'pipelineId', new.pipeline_id,
          'fromStageId', old.stage_id,
          'toStageId', new.stage_id,
          'fromStageName', campaign.crm_stage_name(old.pipeline_id, old.stage_id),
          'toStageName', campaign.crm_stage_name(new.pipeline_id, new.stage_id),
          'value', new.value,
          'currency', new.currency
        )
      );
    end if;

    if new.status is distinct from old.status then
      insert into campaign.crm_activities
        (project_id, kind, subject, body, related_type, related_id, contact_id, actor_id, metadata)
      values (
        new.project_id, 'stage_change',
        case new.status when 'won' then 'Marked won' when 'lost' then 'Marked lost' else 'Reopened' end,
        case when new.status = 'lost' then new.lost_reason else '' end,
        'deal', new.id, new.contact_id, v_actor,
        jsonb_build_object(
          'event', 'status',
          'pipelineId', new.pipeline_id,
          'stageId', new.stage_id,
          'stageName', campaign.crm_stage_name(new.pipeline_id, new.stage_id),
          'fromStatus', old.status,
          'toStatus', new.status,
          'lostReason', new.lost_reason,
          'value', new.value,
          'currency', new.currency
        )
      );
    end if;
  end if;

  -- Exactly one live deal_won event per won deal, kept in step with its value.
  v_props := jsonb_build_object(
    'dealId', new.id,
    'dealName', new.name,
    'pipelineId', new.pipeline_id,
    'stageId', new.stage_id,
    'companyId', new.company_id,
    'ownerId', new.owner_id,
    'sourceCampaignId', new.source_campaign_id
  );

  if new.status = 'won' then
    select id into v_event
    from campaign.tracked_events
    where project_id = new.project_id
      and name = 'deal_won'
      and deleted_at is null
      and properties->>'dealId' = new.id::text
    limit 1;

    if v_event is null then
      insert into campaign.tracked_events
        (project_id, contact_id, name, properties, source, campaign_id, revenue, currency, occurred_at)
      values (
        new.project_id, new.contact_id, 'deal_won', v_props, 'system', new.source_campaign_id,
        new.value, new.currency, coalesce(new.won_at, now())
      );
      if new.contact_id is not null then
        update campaign.contacts set last_activity_at = now() where id = new.contact_id;
      end if;
    elsif tg_op = 'UPDATE' then
      if (new.value, new.currency, new.contact_id, new.source_campaign_id, new.name, new.company_id)
        is distinct from (old.value, old.currency, old.contact_id, old.source_campaign_id, old.name, old.company_id) then
        update campaign.tracked_events
        set revenue = new.value,
            currency = new.currency,
            contact_id = new.contact_id,
            campaign_id = new.source_campaign_id,
            properties = v_props
        where id = v_event;
      end if;
    end if;
  elsif tg_op = 'UPDATE' then
    if old.status = 'won' then
      update campaign.tracked_events
      set deleted_at = now()
      where project_id = new.project_id
        and name = 'deal_won'
        and deleted_at is null
        and properties->>'dealId' = new.id::text;
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists deals_crm_before_write on campaign.deals;
create trigger deals_crm_before_write
before insert or update on campaign.deals
for each row execute function campaign.crm_deals_before_write();

drop trigger if exists deals_crm_after_write on campaign.deals;
create trigger deals_crm_after_write
after insert or update on campaign.deals
for each row execute function campaign.crm_deals_after_write();

-- Task trigger --------------------------------------------------------------

create or replace function campaign.crm_tasks_before_write()
returns trigger
language plpgsql
set search_path = campaign
as $$
begin
  if new.status = 'done' then
    new.completed_at := coalesce(new.completed_at, now());
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_tasks_before_write on campaign.crm_tasks;
create trigger crm_tasks_before_write
before insert or update on campaign.crm_tasks
for each row execute function campaign.crm_tasks_before_write();

-- Contact auto-association --------------------------------------------------

-- Links an unattached contact to the company that owns its email domain (auto_associate on).
create or replace function campaign.crm_contacts_autolink()
returns trigger
language plpgsql
security definer
set search_path = campaign
as $$
declare
  v_company uuid;
begin
  if new.company_id is not null or new.email is null or position('@' in new.email) = 0 then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.email is not distinct from old.email then
      return new;
    end if;
  end if;
  select c.id into v_company
  from campaign.companies c
  where c.project_id = new.project_id
    and c.deleted_at is null
    and c.auto_associate
    and lower(c.domain) = lower(split_part(new.email, '@', 2))
  order by c.created_at
  limit 1;
  new.company_id := v_company;
  return new;
end;
$$;

drop trigger if exists contacts_crm_autolink on campaign.contacts;
create trigger contacts_crm_autolink
before insert or update of email on campaign.contacts
for each row execute function campaign.crm_contacts_autolink();

-- @down
-- deal_won rows already written to campaign.tracked_events are data and stay.
drop trigger if exists contacts_crm_autolink on campaign.contacts;
drop table if exists campaign.crm_activities cascade;
drop table if exists campaign.crm_tasks cascade;
drop table if exists campaign.deals cascade;
drop table if exists campaign.pipelines cascade;
drop table if exists campaign.companies cascade;
drop function if exists campaign.crm_contacts_autolink();
drop function if exists campaign.crm_tasks_before_write();
drop function if exists campaign.crm_deals_after_write();
drop function if exists campaign.crm_deals_before_write();
drop function if exists campaign.crm_stage_name(uuid, text);
