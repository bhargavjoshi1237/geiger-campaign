-- Channels & transactional
--
-- Owns campaign.message_templates (WhatsApp/RCS templates submitted to the provider for approval),
-- campaign.transactional_templates (API-triggered email templates), campaign.inbound_routes (inbound
-- email routing rules, each with its own webhook secret), campaign.in_app_messages (per-contact in-app
-- inbox queue read by the SDK) and campaign.push_subscriptions (web push endpoints from the SDK).
-- Provider credentials stay in campaign.channel_secrets (core); nothing here is a credential.

-- @up
create extension if not exists pgcrypto;
create schema if not exists campaign;
grant usage on schema campaign to anon, authenticated, service_role;

-- Message templates ----------------------------------------------------------

create table if not exists campaign.message_templates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  connection_id uuid references campaign.channel_connections(id) on delete set null,
  -- whatsapp | rcs
  channel text not null default 'whatsapp',
  name text not null default '',
  -- Provider locale code, e.g. en_US, es, pt_BR.
  language text not null default 'en_US',
  -- marketing | utility | authentication
  category text not null default 'marketing',
  -- draft | pending | approved | rejected | paused | disabled
  status text not null default 'draft',
  -- Provider-format components: [{ type: HEADER|BODY|FOOTER|BUTTONS, ... , example }]
  components jsonb not null default '[]'::jsonb,
  rejection_reason text,
  -- Provider-side template id (Meta message template id).
  external_id text,
  -- GREEN | YELLOW | RED | UNKNOWN, as reported by the provider.
  quality_score text,
  submitted_at timestamptz,
  last_synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint message_templates_category_check check (category in ('marketing', 'utility', 'authentication'))
);

create index if not exists message_templates_project_idx
  on campaign.message_templates (project_id, created_at desc)
  where deleted_at is null;
create index if not exists message_templates_connection_idx
  on campaign.message_templates (connection_id)
  where deleted_at is null;
create unique index if not exists message_templates_name_key
  on campaign.message_templates (project_id, channel, name, language)
  where deleted_at is null;

select campaign.apply_standard_access('message_templates', 'campaign.channel.manage');

-- Transactional templates ------------------------------------------------------

create table if not exists campaign.transactional_templates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- Stable identifier API callers reference ("order_receipt").
  key text not null,
  name text not null default 'Untitled template',
  -- welcome | password_reset | receipt | verification | shipping | notification | other
  category text not null default 'other',
  subject text not null default '',
  preheader text not null default '',
  -- html | blocks
  format text not null default 'html',
  -- Block document ({ blocks, settings }) when format = blocks.
  content jsonb not null default '{}'::jsonb,
  html text not null default '',
  from_name text not null default '',
  from_email text not null default '',
  reply_to text not null default '',
  -- [{ key, label, required, sample }]
  variables jsonb not null default '[]'::jsonb,
  version integer not null default 1,
  -- draft | active | inactive
  status text not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint transactional_templates_format_check check (format in ('html', 'blocks')),
  constraint transactional_templates_status_check check (status in ('draft', 'active', 'inactive'))
);

create index if not exists transactional_templates_project_idx
  on campaign.transactional_templates (project_id, created_at desc)
  where deleted_at is null;
create unique index if not exists transactional_templates_key
  on campaign.transactional_templates (project_id, key)
  where deleted_at is null;

select campaign.apply_standard_access('transactional_templates', 'campaign.transactional.manage');

-- Inbound routes ----------------------------------------------------------------

create table if not exists campaign.inbound_routes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default '',
  -- Recipient pattern with * wildcards ("support@*.halcyon.studio"); empty matches any recipient.
  match_recipient text not null default '',
  -- Case-insensitive subject pattern with * wildcards; empty matches any subject.
  match_subject text not null default '',
  -- create_conversation | forward_webhook | tag_contact
  action text not null default 'create_conversation',
  -- { webhookUrl, tags, includeAttachments }
  config jsonb not null default '{}'::jsonb,
  -- Addressing secret in the route's inbound URL (/api/public/inbound/email/<secret_key>).
  secret_key text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  -- active | paused
  status text not null default 'active',
  position integer not null default 0,
  received_count integer not null default 0,
  last_received_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint inbound_routes_action_check check (action in ('create_conversation', 'forward_webhook', 'tag_contact')),
  constraint inbound_routes_status_check check (status in ('active', 'paused'))
);

create index if not exists inbound_routes_project_idx
  on campaign.inbound_routes (project_id, created_at desc)
  where deleted_at is null;
create unique index if not exists inbound_routes_secret_key on campaign.inbound_routes (secret_key);

select campaign.apply_standard_access('inbound_routes', 'campaign.transactional.manage');

-- In-app messages: the per-contact inbox the in-app SDK reads ----------------------

create table if not exists campaign.in_app_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  contact_id uuid not null references campaign.contacts(id) on delete cascade,
  delivery_id uuid references campaign.deliveries(id) on delete set null,
  campaign_id uuid references campaign.campaigns(id) on delete set null,
  source_type text not null default 'manual',
  source_id uuid,
  -- inbox | banner | modal (how the SDK should present it)
  format text not null default 'inbox',
  title text not null default '',
  body text not null default '',
  -- { label, url }
  cta jsonb not null default '{}'::jsonb,
  -- unread | read | dismissed | expired
  status text not null default 'unread',
  expires_at timestamptz,
  read_at timestamptz,
  clicked_at timestamptz,
  dismissed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint in_app_messages_status_check check (status in ('unread', 'read', 'dismissed', 'expired'))
);

create index if not exists in_app_messages_project_idx
  on campaign.in_app_messages (project_id, created_at desc)
  where deleted_at is null;
create index if not exists in_app_messages_contact_idx
  on campaign.in_app_messages (contact_id, created_at desc)
  where deleted_at is null;

select campaign.apply_standard_access('in_app_messages', 'campaign.channel.manage');

-- Push subscriptions: browser push endpoints registered through the SDK ------------

create table if not exists campaign.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  connection_id uuid references campaign.channel_connections(id) on delete set null,
  contact_id uuid references campaign.contacts(id) on delete set null,
  anonymous_id text,
  -- web (ios | android reserved for native SDKs)
  platform text not null default 'web',
  endpoint text not null,
  -- { p256dh, auth } from PushSubscription.toJSON()
  keys jsonb not null default '{}'::jsonb,
  user_agent text,
  -- active | expired | unsubscribed
  status text not null default 'active',
  last_seen_at timestamptz,
  last_sent_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint push_subscriptions_status_check check (status in ('active', 'expired', 'unsubscribed'))
);

create index if not exists push_subscriptions_project_idx
  on campaign.push_subscriptions (project_id, created_at desc)
  where deleted_at is null;
create index if not exists push_subscriptions_contact_idx
  on campaign.push_subscriptions (contact_id)
  where deleted_at is null;
create unique index if not exists push_subscriptions_endpoint_key
  on campaign.push_subscriptions (project_id, endpoint);

select campaign.apply_standard_access('push_subscriptions', 'campaign.channel.manage');

-- @down
drop table if exists campaign.push_subscriptions cascade;
drop table if exists campaign.in_app_messages cascade;
drop table if exists campaign.inbound_routes cascade;
drop table if exists campaign.transactional_templates cascade;
drop table if exists campaign.message_templates cascade;
