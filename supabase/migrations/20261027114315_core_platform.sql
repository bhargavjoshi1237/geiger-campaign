-- Core platform
--
-- The shared backbone every area builds on. Owns:
--   functions  campaign.touch_updated_at(), campaign.rbac_is_member(), campaign.merge_meta(),
--              campaign.apply_standard_access()
--   tables     campaign.contacts, lists, list_members, segments, campaigns, deliveries,
--              tracked_events, channel_connections, channel_secrets, conversations,
--              conversation_messages
-- Access model: any active project member reads; writes need the table's operation key
-- (campaign.rbac_allows). Server routes write logs/ingest through the service role.

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

-- Read predicate for product tables: the caller holds any active grant in the project.
create or replace function campaign.rbac_is_member(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public, campaign
as $$
  select exists (
    select 1
    from campaign.role_grants g
    join public.roles r on r.id = g.role_id
    where g.user_id = auth.uid()
      and g.project_id = p_project
      and g.status = 'active'
      and g.deleted_at is null
      and r.deleted_at is null
  );
$$;

grant execute on function campaign.rbac_is_member(uuid) to anon, authenticated;

-- Shallow-merges a patch into one row's metadata bag so one editor tab never clobbers another.
-- Security invoker, so the table's own RLS still decides whether the caller may write.
create or replace function campaign.merge_meta(p_table text, p_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = campaign
as $$
declare
  merged jsonb;
begin
  execute format(
    'update campaign.%I set metadata = coalesce(metadata, ''{}''::jsonb) || $1 where id = $2 and deleted_at is null returning metadata',
    p_table
  )
  into merged
  using coalesce(p_patch, '{}'::jsonb), p_id;
  return merged;
end;
$$;

grant execute on function campaign.merge_meta(text, uuid, jsonb) to authenticated;

-- Applies the standard access contract to a project-scoped table: RLS, member read,
-- key-gated writes (read-only to clients when p_write_key is null), grants and the
-- updated_at trigger. Migration-time only; never callable by clients.
create or replace function campaign.apply_standard_access(p_table text, p_write_key text default null)
returns void
language plpgsql
set search_path = campaign
as $$
begin
  execute format('alter table campaign.%I enable row level security', p_table);

  execute format('drop policy if exists %I on campaign.%I', p_table || '_member_read', p_table);
  execute format(
    'create policy %I on campaign.%I for select to authenticated using (campaign.rbac_is_member(project_id))',
    p_table || '_member_read', p_table
  );

  execute format('drop policy if exists %I on campaign.%I', p_table || '_write', p_table);
  if p_write_key is not null then
    execute format(
      'create policy %I on campaign.%I for all to authenticated using (campaign.rbac_allows(%L, project_id)) with check (campaign.rbac_allows(%L, project_id))',
      p_table || '_write', p_table, p_write_key, p_write_key
    );
    execute format('grant select, insert, update on campaign.%I to authenticated', p_table);
  else
    execute format('grant select on campaign.%I to authenticated', p_table);
  end if;
  execute format('grant all on campaign.%I to service_role', p_table);

  execute format('drop trigger if exists %I on campaign.%I', p_table || '_touch_updated_at', p_table);
  execute format(
    'create trigger %I before update on campaign.%I for each row execute function campaign.touch_updated_at()',
    p_table || '_touch_updated_at', p_table
  );
end;
$$;

revoke all on function campaign.apply_standard_access(text, text) from public, anon, authenticated;

-- Contacts ------------------------------------------------------------------

create table if not exists campaign.contacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  email text,
  phone text,
  first_name text not null default '',
  last_name text not null default '',
  -- subscribed | unsubscribed | bounced | complained | pending
  status text not null default 'subscribed',
  source text not null default 'manual',
  tags text[] not null default '{}',
  -- Custom field values keyed by field key.
  attributes jsonb not null default '{}'::jsonb,
  lead_score integer not null default 0,
  timezone text,
  locale text,
  company_id uuid,
  last_activity_at timestamptz,
  unsubscribed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint contacts_status_check check (status in ('subscribed', 'unsubscribed', 'bounced', 'complained', 'pending'))
);

create unique index if not exists contacts_project_email_key
  on campaign.contacts (project_id, lower(email))
  where deleted_at is null and email is not null;
create index if not exists contacts_project_idx
  on campaign.contacts (project_id, created_at desc)
  where deleted_at is null;
create index if not exists contacts_phone_idx
  on campaign.contacts (project_id, phone)
  where deleted_at is null and phone is not null;
create index if not exists contacts_tags_idx on campaign.contacts using gin (tags);

-- Lists ---------------------------------------------------------------------

create table if not exists campaign.lists (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled list',
  description text not null default '',
  double_opt_in boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists lists_project_idx
  on campaign.lists (project_id, created_at desc)
  where deleted_at is null;

-- Membership rows are never hard-deleted: removal sets status 'removed' + deleted_at,
-- re-adding upserts on (list_id, contact_id).
create table if not exists campaign.list_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  list_id uuid not null references campaign.lists(id) on delete cascade,
  contact_id uuid not null references campaign.contacts(id) on delete cascade,
  -- subscribed | unsubscribed | pending | removed
  status text not null default 'subscribed',
  source text not null default 'manual',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint list_members_unique unique (list_id, contact_id)
);

create index if not exists list_members_contact_idx on campaign.list_members (contact_id);

-- Segments ------------------------------------------------------------------

create table if not exists campaign.segments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled segment',
  description text not null default '',
  -- all | any
  match text not null default 'all',
  -- [{ id, field, operator, value }] evaluated by lib/audience/segment_rules.js
  conditions jsonb not null default '[]'::jsonb,
  contact_count integer not null default 0,
  computed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists segments_project_idx
  on campaign.segments (project_id, created_at desc)
  where deleted_at is null;

-- Campaigns -----------------------------------------------------------------

create table if not exists campaign.campaigns (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled campaign',
  channel text not null default 'email',
  -- regular | ab_test | automated
  type text not null default 'regular',
  -- draft | in_review | approved | scheduled | sending | sent | paused | cancelled | failed
  status text not null default 'draft',
  subject text not null default '',
  preheader text not null default '',
  from_name text not null default '',
  from_email text not null default '',
  reply_to text not null default '',
  -- Builder document: { blocks: [...], settings: {...} }
  content jsonb not null default '{}'::jsonb,
  -- Rendered HTML snapshot taken at send time.
  html text,
  template_id uuid,
  -- { listIds, segmentIds, excludeListIds, excludeSegmentIds }
  audience jsonb not null default '{}'::jsonb,
  -- { mode: now | scheduled | timezone | optimized, ... }
  send_strategy jsonb not null default '{}'::jsonb,
  ab jsonb not null default '{}'::jsonb,
  -- Cached rollups: recipients, delivered, opens, clicks, bounces, unsubscribes, conversions, revenue.
  metrics jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  scheduled_at timestamptz,
  sent_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint campaigns_status_check check (
    status in ('draft', 'in_review', 'approved', 'scheduled', 'sending', 'sent', 'paused', 'cancelled', 'failed')
  )
);

create index if not exists campaigns_project_idx
  on campaign.campaigns (project_id, created_at desc)
  where deleted_at is null;
create index if not exists campaigns_due_idx
  on campaign.campaigns (scheduled_at)
  where status = 'scheduled' and deleted_at is null;

-- Deliveries: one row per message to one recipient on any channel (append-only send log) --

create table if not exists campaign.deliveries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  channel text not null default 'email',
  -- queued | sent | delivered | opened | clicked | read | replied | bounced | complained | failed | not_sent | unsubscribed
  status text not null default 'queued',
  contact_id uuid references campaign.contacts(id) on delete set null,
  to_address text not null,
  -- campaign | automation | broadcast | transactional | flow | test | inbox | community
  source_type text not null default 'campaign',
  source_id uuid,
  campaign_id uuid references campaign.campaigns(id) on delete set null,
  variant text,
  subject text,
  provider text,
  provider_id text,
  connection_id uuid,
  error text,
  cost numeric(12, 5) not null default 0,
  currency text not null default 'USD',
  open_count integer not null default 0,
  click_count integer not null default 0,
  idempotency_key text,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  unsubscribed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists deliveries_idempotency_key
  on campaign.deliveries (idempotency_key)
  where idempotency_key is not null;
create index if not exists deliveries_project_idx on campaign.deliveries (project_id, created_at desc);
create index if not exists deliveries_campaign_idx on campaign.deliveries (campaign_id);
create index if not exists deliveries_contact_idx on campaign.deliveries (contact_id);
create index if not exists deliveries_source_idx on campaign.deliveries (source_type, source_id);
create index if not exists deliveries_provider_idx on campaign.deliveries (provider_id) where provider_id is not null;

-- Tracked events: behaviour ingested from the JS snippet, API, forms, commerce and channels --

create table if not exists campaign.tracked_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  contact_id uuid references campaign.contacts(id) on delete set null,
  anonymous_id text,
  name text not null,
  properties jsonb not null default '{}'::jsonb,
  -- web | api | email | form | commerce | social | system
  source text not null default 'web',
  delivery_id uuid references campaign.deliveries(id) on delete set null,
  campaign_id uuid references campaign.campaigns(id) on delete set null,
  revenue numeric(14, 2),
  currency text,
  url text,
  referrer text,
  utm jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists tracked_events_project_idx on campaign.tracked_events (project_id, occurred_at desc);
create index if not exists tracked_events_name_idx on campaign.tracked_events (project_id, name, occurred_at desc);
create index if not exists tracked_events_contact_idx on campaign.tracked_events (contact_id, occurred_at desc);
create index if not exists tracked_events_campaign_idx on campaign.tracked_events (campaign_id) where campaign_id is not null;

-- Channel connections: one row per connected sending/receiving account --

create table if not exists campaign.channel_connections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- email | sms | whatsapp | push | in_app | instagram | messenger | telegram | tiktok | rcs
  channel text not null,
  -- geiger_email | twilio | meta_cloud | meta_graph | telegram_bot | tiktok | google_rcs | web_push
  provider text not null,
  name text not null default '',
  -- Provider-side id: WABA phone number id, page id, IG user id, bot username…
  external_id text,
  display_handle text not null default '',
  -- connected | pending | error | disconnected
  status text not null default 'pending',
  -- Non-secret settings. Tokens live in channel_secrets.
  config jsonb not null default '{}'::jsonb,
  -- Quality rating, messaging tier, token expiry, last error…
  health jsonb not null default '{}'::jsonb,
  connected_at timestamptz,
  last_checked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint channel_connections_channel_check check (
    channel in ('email', 'sms', 'whatsapp', 'push', 'in_app', 'instagram', 'messenger', 'telegram', 'tiktok', 'rcs')
  )
);

create index if not exists channel_connections_project_idx
  on campaign.channel_connections (project_id, channel)
  where deleted_at is null;
create unique index if not exists channel_connections_external_key
  on campaign.channel_connections (provider, external_id)
  where external_id is not null and deleted_at is null;

-- Provider credentials. No client policy at all: only the service role (server routes) reads or writes.
create table if not exists campaign.channel_secrets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  connection_id uuid not null unique references campaign.channel_connections(id) on delete cascade,
  secrets jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Conversations: inbox threads across every channel --

create table if not exists campaign.conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  channel text not null,
  connection_id uuid references campaign.channel_connections(id) on delete set null,
  contact_id uuid references campaign.contacts(id) on delete set null,
  -- dm | comment | sms | chat | email
  kind text not null default 'dm',
  external_thread_id text,
  title text not null default '',
  -- open | pending | snoozed | resolved
  status text not null default 'open',
  -- low | normal | high | urgent
  priority text not null default 'normal',
  assignee_id uuid,
  -- bot | human: who currently owns replies (human handover flips it).
  handled_by text not null default 'human',
  unread_count integer not null default 0,
  tags text[] not null default '{}',
  last_message_at timestamptz,
  -- Drives the platform messaging window (24h Meta, 24h WhatsApp service window).
  last_inbound_at timestamptz,
  window_expires_at timestamptz,
  sla_due_at timestamptz,
  snoozed_until timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists conversations_project_idx
  on campaign.conversations (project_id, last_message_at desc nulls last)
  where deleted_at is null;
create index if not exists conversations_contact_idx on campaign.conversations (contact_id);
create unique index if not exists conversations_thread_key
  on campaign.conversations (connection_id, external_thread_id)
  where external_thread_id is not null and deleted_at is null;

create table if not exists campaign.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  conversation_id uuid not null references campaign.conversations(id) on delete cascade,
  -- inbound | outbound | note
  direction text not null default 'inbound',
  -- contact | agent | bot | system
  sender_type text not null default 'contact',
  sender_id uuid,
  body text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  external_id text,
  -- received | queued | sent | delivered | read | failed
  status text not null default 'received',
  delivery_id uuid references campaign.deliveries(id) on delete set null,
  error text,
  sent_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists conversation_messages_thread_idx
  on campaign.conversation_messages (conversation_id, sent_at);
create unique index if not exists conversation_messages_external_key
  on campaign.conversation_messages (conversation_id, external_id)
  where external_id is not null;

-- Access ----------------------------------------------------------------------

select campaign.apply_standard_access('contacts', 'campaign.contact.edit');
select campaign.apply_standard_access('lists', 'campaign.contact.edit');
select campaign.apply_standard_access('list_members', 'campaign.contact.edit');
select campaign.apply_standard_access('segments', 'campaign.contact.edit');
select campaign.apply_standard_access('campaigns', 'campaign.campaign.edit');
select campaign.apply_standard_access('deliveries');
select campaign.apply_standard_access('tracked_events');
select campaign.apply_standard_access('channel_connections', 'campaign.channel.manage');
select campaign.apply_standard_access('conversations', 'campaign.inbox.reply');
select campaign.apply_standard_access('conversation_messages', 'campaign.inbox.reply');

alter table campaign.channel_secrets enable row level security;
grant all on campaign.channel_secrets to service_role;
drop trigger if exists channel_secrets_touch_updated_at on campaign.channel_secrets;
create trigger channel_secrets_touch_updated_at
before update on campaign.channel_secrets
for each row execute function campaign.touch_updated_at();

-- @down
drop table if exists campaign.conversation_messages cascade;
drop table if exists campaign.conversations cascade;
drop table if exists campaign.channel_secrets cascade;
drop table if exists campaign.channel_connections cascade;
drop table if exists campaign.tracked_events cascade;
drop table if exists campaign.deliveries cascade;
drop table if exists campaign.campaigns cascade;
drop table if exists campaign.segments cascade;
drop table if exists campaign.list_members cascade;
drop table if exists campaign.lists cascade;
drop table if exists campaign.contacts cascade;
drop function if exists campaign.apply_standard_access(text, text);
drop function if exists campaign.merge_meta(text, uuid, jsonb);
drop function if exists campaign.rbac_is_member(uuid);
