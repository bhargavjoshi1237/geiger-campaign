-- Audience
--
-- Owns:
--   tables     campaign.tags, custom_fields, scoring_rules, suppressions, contact_consents
--   functions  campaign.contacts_retag(), campaign.contacts_rename_tag()
--   indexes    contacts_lead_score_idx on the core campaign.contacts table
-- contact_consents is the append-only opt-in ledger: the latest row per (contact, channel) wins and
-- clients may only insert into it. Writes on every table need campaign.contact.edit.

-- @up
create extension if not exists pgcrypto;
create schema if not exists campaign;
grant usage on schema campaign to anon, authenticated, service_role;

-- Tag catalog: names, colours and descriptions for the free-form contacts.tags array.
create table if not exists campaign.tags (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  -- emerald | blue | amber | violet | red | zinc
  color text not null default 'zinc',
  description text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists tags_project_name_key
  on campaign.tags (project_id, lower(name))
  where deleted_at is null;
create index if not exists tags_project_idx
  on campaign.tags (project_id, created_at desc)
  where deleted_at is null;

-- Custom field definitions; values live in contacts.attributes keyed by `key`.
create table if not exists campaign.custom_fields (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  key text not null,
  label text not null default '',
  type text not null default 'text',
  -- Allowed values for select fields: ["Gold", "Silver"].
  options jsonb not null default '[]'::jsonb,
  required boolean not null default false,
  description text not null default '',
  position integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint custom_fields_type_check check (type in ('text', 'number', 'date', 'boolean', 'select')),
  constraint custom_fields_key_check check (key ~ '^[a-z][a-z0-9_]*$')
);

create unique index if not exists custom_fields_project_key
  on campaign.custom_fields (project_id, key)
  where deleted_at is null;
create index if not exists custom_fields_project_idx
  on campaign.custom_fields (project_id, created_at desc)
  where deleted_at is null;

-- Lead scoring rules, evaluated by lib/audience/scoring.js into contacts.lead_score (0–100).
create table if not exists campaign.scoring_rules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled rule',
  -- email_opened | email_clicked | event | attribute
  trigger text not null default 'event',
  -- tracked_events.name for trigger = 'event'.
  event_name text,
  -- { field, operator, value } in the segment rule vocabulary for trigger = 'attribute'.
  condition jsonb not null default '{}'::jsonb,
  points integer not null default 0,
  -- every | once
  frequency text not null default 'every',
  -- Points from one occurrence fade linearly to zero over this many days; null keeps them.
  decay_days integer,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint scoring_rules_trigger_check check (trigger in ('email_opened', 'email_clicked', 'event', 'attribute')),
  constraint scoring_rules_frequency_check check (frequency in ('every', 'once')),
  constraint scoring_rules_decay_check check (decay_days is null or decay_days > 0)
);

create index if not exists scoring_rules_project_idx
  on campaign.scoring_rules (project_id, created_at desc)
  where deleted_at is null;

-- Address-level suppression list honoured by lib/audience/resolve.js on every send.
create table if not exists campaign.suppressions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- email | phone | domain; value is stored normalised (lowercase email/domain, digits-only phone with +).
  kind text not null default 'email',
  value text not null,
  -- unsubscribed | hard_bounce | complaint | manual | invalid
  reason text not null default 'manual',
  source text not null default '',
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint suppressions_kind_check check (kind in ('email', 'phone', 'domain')),
  constraint suppressions_reason_check check (reason in ('unsubscribed', 'hard_bounce', 'complaint', 'manual', 'invalid'))
);

create unique index if not exists suppressions_project_value_key
  on campaign.suppressions (project_id, kind, value)
  where deleted_at is null;
create index if not exists suppressions_project_idx
  on campaign.suppressions (project_id, created_at desc)
  where deleted_at is null;

-- Per-channel opt-in ledger (append-only). Unsubscribe/STOP handlers insert opted_out rows server-side.
create table if not exists campaign.contact_consents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  contact_id uuid not null references campaign.contacts(id) on delete cascade,
  channel text not null,
  -- opted_in | opted_out | pending
  status text not null,
  -- Where consent was captured: "Website signup form", "Import: roster.csv", "STOP reply"…
  source text not null default '',
  -- Evidence: { method, form_id, file_name, row, message_id, recorded_by, note, … }
  proof jsonb not null default '{}'::jsonb,
  ip text,
  user_agent text,
  captured_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint contact_consents_channel_check check (
    channel in ('email', 'sms', 'whatsapp', 'rcs', 'instagram', 'messenger', 'telegram', 'tiktok', 'push', 'in_app')
  ),
  constraint contact_consents_status_check check (status in ('opted_in', 'opted_out', 'pending'))
);

create index if not exists contact_consents_contact_idx
  on campaign.contact_consents (contact_id, channel, captured_at desc);
create index if not exists contact_consents_project_idx
  on campaign.contact_consents (project_id, channel, captured_at desc);

-- Lead score bands and the scoring screen's distribution read contacts by score.
create index if not exists contacts_lead_score_idx
  on campaign.contacts (project_id, lead_score)
  where deleted_at is null;

-- Adds and removes tags on a set of contacts in one statement (case-insensitive, de-duplicated,
-- first spelling kept). Security invoker, so contacts RLS decides who may write.
create or replace function campaign.contacts_retag(
  p_project uuid,
  p_ids uuid[],
  p_add text[] default '{}',
  p_remove text[] default '{}'
)
returns integer
language plpgsql
security invoker
set search_path = campaign
as $$
declare
  affected integer;
begin
  update campaign.contacts c
     set tags = coalesce((
       select array_agg(v.t order by v.first_seen)
       from (
         select (array_agg(m.t order by m.ord))[1] as t, min(m.ord) as first_seen
         from unnest(c.tags || coalesce(p_add, '{}'::text[])) with ordinality as m(t, ord)
         where m.t is not null
           and m.t <> ''
           and lower(m.t) <> all (select lower(r) from unnest(coalesce(p_remove, '{}'::text[])) as r)
         group by lower(m.t)
       ) v
     ), '{}'::text[])
   where c.project_id = p_project
     and c.id = any (p_ids)
     and c.deleted_at is null;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- Renames a tag on every contact in the project; p_to null removes it. Returns contacts touched.
create or replace function campaign.contacts_rename_tag(p_project uuid, p_from text, p_to text default null)
returns integer
language plpgsql
security invoker
set search_path = campaign
as $$
declare
  affected integer;
begin
  update campaign.contacts c
     set tags = coalesce((
       select array_agg(v.t order by v.first_seen)
       from (
         select (array_agg(m.t order by m.ord))[1] as t, min(m.ord) as first_seen
         from (
           select case when lower(u.t) = lower(p_from) then p_to else u.t end as t, u.ord
           from unnest(c.tags) with ordinality as u(t, ord)
         ) m
         where m.t is not null and m.t <> ''
         group by lower(m.t)
       ) v
     ), '{}'::text[])
   where c.project_id = p_project
     and c.deleted_at is null
     and exists (select 1 from unnest(c.tags) as x where lower(x) = lower(p_from));
  get diagnostics affected = row_count;
  return affected;
end;
$$;

grant execute on function campaign.contacts_retag(uuid, uuid[], text[], text[]) to authenticated, service_role;
grant execute on function campaign.contacts_rename_tag(uuid, text, text) to authenticated, service_role;

-- Access ----------------------------------------------------------------------

select campaign.apply_standard_access('tags', 'campaign.contact.edit');
select campaign.apply_standard_access('custom_fields', 'campaign.contact.edit');
select campaign.apply_standard_access('scoring_rules', 'campaign.contact.edit');
select campaign.apply_standard_access('suppressions', 'campaign.contact.edit');
select campaign.apply_standard_access('contact_consents', 'campaign.contact.edit');

-- The consent ledger is append-only for clients.
revoke update on campaign.contact_consents from authenticated;

-- @down
drop function if exists campaign.contacts_rename_tag(uuid, text, text);
drop function if exists campaign.contacts_retag(uuid, uuid[], text[], text[]);
drop index if exists campaign.contacts_lead_score_idx;
drop table if exists campaign.contact_consents cascade;
drop table if exists campaign.suppressions cascade;
drop table if exists campaign.scoring_rules cascade;
drop table if exists campaign.custom_fields cascade;
drop table if exists campaign.tags cascade;
