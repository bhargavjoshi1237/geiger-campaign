-- Inbox
--
-- Owns campaign.saved_replies (canned replies with merge tags), campaign.assignment_rules (round-robin /
-- least-busy routing), campaign.sla_policies (first-response + resolution targets with business hours) and
-- campaign.chat_widgets (website live-chat widgets keyed by a public id). Extends the core
-- campaign.conversations with SLA + response timestamps. Live-chat ingest and routing write through the
-- service role (public routes, auto-assign); everything else is member-read, key-gated writes.

-- @up
create extension if not exists pgcrypto;
create schema if not exists campaign;
grant usage on schema campaign to anon, authenticated, service_role;

-- Saved replies -----------------------------------------------------------------

create table if not exists campaign.saved_replies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null default '',
  -- Reply text with merge tags ({{first_name|there}}), resolved per contact when inserted.
  body text not null default '',
  -- Channels it is offered on; empty = every channel.
  channels text[] not null default '{}',
  -- Typed as /shortcut in the composer.
  shortcut text not null default '',
  category text not null default '',
  usage_count integer not null default 0,
  last_used_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists saved_replies_project_idx
  on campaign.saved_replies (project_id, created_at desc)
  where deleted_at is null;
create unique index if not exists saved_replies_shortcut_key
  on campaign.saved_replies (project_id, lower(shortcut))
  where deleted_at is null and shortcut <> '';

select campaign.apply_standard_access('saved_replies', 'campaign.inbox.reply');

-- Assignment rules ----------------------------------------------------------------

create table if not exists campaign.assignment_rules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled rule',
  -- round_robin | least_busy | manual
  strategy text not null default 'round_robin',
  -- Teammate user ids eligible for this rule.
  members uuid[] not null default '{}',
  -- Channels it routes; empty = every channel.
  channels text[] not null default '{}',
  -- { match: all | any, conditions: [{ id, field, operator, value }] } over the conversation.
  conditions jsonb not null default '{"match": "all", "conditions": []}'::jsonb,
  -- Evaluation order, lowest first; the first matching active rule wins.
  position integer not null default 0,
  active boolean not null default true,
  -- Skip a member already holding this many open conversations; null = no cap.
  max_open_per_member integer,
  -- Round-robin pointer into members, advanced by the server on each assignment.
  next_index integer not null default 0,
  assigned_count integer not null default 0,
  last_assigned_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint assignment_rules_strategy_check check (strategy in ('round_robin', 'least_busy', 'manual')),
  constraint assignment_rules_cap_check check (max_open_per_member is null or max_open_per_member > 0)
);

create index if not exists assignment_rules_project_idx
  on campaign.assignment_rules (project_id, position, created_at)
  where deleted_at is null;

select campaign.apply_standard_access('assignment_rules', 'campaign.team.assign');

-- SLA policies --------------------------------------------------------------------

create table if not exists campaign.sla_policies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled policy',
  first_response_minutes integer not null default 60,
  -- null = no resolution target.
  resolution_minutes integer,
  -- { enabled, timezone, days: { mon: { open, start: "09:00", end: "17:00" }, … } }; off = 24/7 clock.
  business_hours jsonb not null default '{"enabled": false, "timezone": "UTC", "days": {}}'::jsonb,
  -- Scope; empty arrays = every channel / priority.
  channels text[] not null default '{}',
  priorities text[] not null default '{}',
  position integer not null default 0,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint sla_policies_first_response_check check (first_response_minutes > 0),
  constraint sla_policies_resolution_check check (resolution_minutes is null or resolution_minutes > 0)
);

create index if not exists sla_policies_project_idx
  on campaign.sla_policies (project_id, position, created_at)
  where deleted_at is null;

select campaign.apply_standard_access('sla_policies', 'campaign.team.assign');

-- Chat widgets ----------------------------------------------------------------------

create table if not exists campaign.chat_widgets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- Embedded in the install snippet; the public chat API is keyed by it.
  public_id text not null,
  name text not null default 'Website chat',
  -- active | paused
  status text not null default 'active',
  -- { position: bottom-right | bottom-left, color, title, launcherLabel }
  appearance jsonb not null default '{}'::jsonb,
  greeting text not null default '',
  -- Ask for name + email before the first message.
  require_email boolean not null default false,
  -- { mode: email_capture | message | hide, message }
  offline jsonb not null default '{"mode": "email_capture", "message": ""}'::jsonb,
  -- Same shape as sla_policies.business_hours; off = always online.
  business_hours jsonb not null default '{"enabled": false, "timezone": "UTC", "days": {}}'::jsonb,
  -- Hostnames allowed to load the widget; empty = any site.
  allowed_domains text[] not null default '{}',
  assignment_rule_id uuid references campaign.assignment_rules(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chat_widgets_status_check check (status in ('active', 'paused'))
);

create unique index if not exists chat_widgets_public_id_key on campaign.chat_widgets (public_id);
create index if not exists chat_widgets_project_idx
  on campaign.chat_widgets (project_id, created_at desc)
  where deleted_at is null;

select campaign.apply_standard_access('chat_widgets', 'campaign.channel.manage');

-- Conversations: SLA + response timestamps ------------------------------------------

alter table campaign.conversations add column if not exists first_response_at timestamptz;
alter table campaign.conversations add column if not exists resolved_at timestamptz;
alter table campaign.conversations add column if not exists resolution_due_at timestamptz;
alter table campaign.conversations
  add column if not exists sla_policy_id uuid references campaign.sla_policies(id) on delete set null;

create index if not exists conversations_queue_idx
  on campaign.conversations (project_id, assignee_id, status)
  where deleted_at is null;
create index if not exists conversations_sla_idx
  on campaign.conversations (project_id, sla_due_at)
  where deleted_at is null and sla_due_at is not null;
create index if not exists conversation_messages_project_idx
  on campaign.conversation_messages (project_id, sent_at desc);

-- @down
drop index if exists campaign.conversation_messages_project_idx;
drop index if exists campaign.conversations_sla_idx;
drop index if exists campaign.conversations_queue_idx;
alter table campaign.conversations drop column if exists sla_policy_id;
alter table campaign.conversations drop column if exists resolution_due_at;
alter table campaign.conversations drop column if exists resolved_at;
alter table campaign.conversations drop column if exists first_response_at;
drop table if exists campaign.chat_widgets cascade;
drop table if exists campaign.sla_policies cascade;
drop table if exists campaign.assignment_rules cascade;
drop table if exists campaign.saved_replies cascade;
