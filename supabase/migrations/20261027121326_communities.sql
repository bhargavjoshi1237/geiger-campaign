-- Communities
--
-- Telegram channels and groups (fully automated through a connected bot), WhatsApp Channels and Instagram
-- broadcast channels (manual-assist: no public write API, so posts are planned here and a person is reminded
-- to publish them), join links with click -> join attribution, and follower snapshots for growth reporting.
-- Owns:
--   tables     campaign.community_channels, community_posts, community_groups, group_rules,
--              community_group_events, group_flood_counters, join_links, member_snapshots
--   functions  campaign.community_flood_hit(), campaign.join_link_bump()
-- Depends on the core platform migration (apply_standard_access, channel_connections).

-- @up
create extension if not exists pgcrypto;
create schema if not exists campaign;
grant usage on schema campaign to anon, authenticated, service_role;

-- Channels: one row per community surface the project runs ---------------------

create table if not exists campaign.community_channels (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- telegram_channel | telegram_group | whatsapp_channel | instagram_broadcast
  platform text not null,
  -- The Telegram bot (channel_connections, channel "telegram"); null for manual-assist platforms.
  connection_id uuid references campaign.channel_connections(id) on delete set null,
  -- Telegram chat id (-100…), resolved when the chat is linked; null for manual-assist platforms.
  external_chat_id text,
  name text not null default '',
  handle text not null default '',
  -- Public join / follow URL (t.me/…, whatsapp.com/channel/…, ig.me/j/…).
  invite_url text not null default '',
  follower_count integer not null default 0,
  -- pending (bot was added, not linked yet) | active | error (bot lost its admin rights)
  status text not null default 'active',
  -- Telegram: verified bot rights + posting defaults. Manual: default assignee + reminder lead.
  settings jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint community_channels_platform_check check (
    platform in ('telegram_channel', 'telegram_group', 'whatsapp_channel', 'instagram_broadcast')
  ),
  constraint community_channels_status_check check (status in ('pending', 'active', 'error'))
);

create index if not exists community_channels_project_idx
  on campaign.community_channels (project_id, created_at desc)
  where deleted_at is null;
create unique index if not exists community_channels_chat_key
  on campaign.community_channels (project_id, external_chat_id)
  where external_chat_id is not null and deleted_at is null;

-- Posts: Telegram posts the bot publishes, or manual-assist posts a person publishes after a reminder --

create table if not exists campaign.community_posts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  channel_id uuid not null references campaign.community_channels(id) on delete cascade,
  body text not null default '',
  -- [{ url, type: photo | video | document, name, assetId }]
  media jsonb not null default '[]'::jsonb,
  -- [{ text, url }]: one inline URL button per row (Telegram only).
  buttons jsonb not null default '[]'::jsonb,
  -- { parseMode, silent, protectContent, disablePreview }
  options jsonb not null default '{}'::jsonb,
  -- draft | scheduled | posted | reminder_sent | failed
  status text not null default 'draft',
  -- automated (the bot posts it) | manual_assist (a person posts it after a reminder)
  mode text not null default 'automated',
  scheduled_at timestamptz,
  posted_at timestamptz,
  external_message_id text,
  assignee_id uuid,
  views integer not null default 0,
  reactions integer not null default 0,
  error text,
  reminder_sent_at timestamptz,
  -- Worker claim, so overlapping scheduler ticks never publish or remind twice.
  claimed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint community_posts_status_check check (status in ('draft', 'scheduled', 'posted', 'reminder_sent', 'failed')),
  constraint community_posts_mode_check check (mode in ('automated', 'manual_assist'))
);

create index if not exists community_posts_project_idx
  on campaign.community_posts (project_id, created_at desc)
  where deleted_at is null;
create index if not exists community_posts_channel_idx
  on campaign.community_posts (channel_id, scheduled_at desc)
  where deleted_at is null;
create index if not exists community_posts_due_idx
  on campaign.community_posts (scheduled_at)
  where status = 'scheduled' and deleted_at is null;
create index if not exists community_posts_message_idx
  on campaign.community_posts (channel_id, external_message_id)
  where external_message_id is not null;

-- Groups: welcome bot + moderation settings for a linked Telegram group ---------

create table if not exists campaign.community_groups (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  channel_id uuid not null references campaign.community_channels(id) on delete cascade,
  welcome_enabled boolean not null default false,
  -- Supports {first_name}, {username} and {group}.
  welcome_text text not null default '',
  -- [{ text, url }]
  welcome_buttons jsonb not null default '[]'::jsonb,
  -- Delete Telegram's "joined" / "left" service messages.
  clean_service_messages boolean not null default false,
  -- Group admins are never moderated.
  exempt_admins boolean not null default true,
  -- Warnings within 24h before the escalation action applies.
  warn_limit integer not null default 3,
  -- restrict | ban
  escalation_action text not null default 'restrict',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint community_groups_escalation_check check (escalation_action in ('restrict', 'ban'))
);

create index if not exists community_groups_project_idx
  on campaign.community_groups (project_id, created_at desc)
  where deleted_at is null;
create unique index if not exists community_groups_channel_key
  on campaign.community_groups (channel_id)
  where deleted_at is null;

create table if not exists campaign.group_rules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  group_id uuid not null references campaign.community_groups(id) on delete cascade,
  -- banned_words | block_links | flood
  kind text not null,
  name text not null default '',
  enabled boolean not null default true,
  -- delete | warn | restrict | ban (the offending message is deleted in every case)
  action text not null default 'delete',
  -- banned_words { words } · block_links { allowDomains } · flood { maxMessages, perSeconds } · all { restrictMinutes }
  config jsonb not null default '{}'::jsonb,
  sort integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint group_rules_kind_check check (kind in ('banned_words', 'block_links', 'flood')),
  constraint group_rules_action_check check (action in ('delete', 'warn', 'restrict', 'ban'))
);

create index if not exists group_rules_group_idx
  on campaign.group_rules (group_id, sort)
  where deleted_at is null;

-- Moderation log: every join, welcome and enforcement action the bot took (server-written) --

create table if not exists campaign.community_group_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  group_id uuid not null references campaign.community_groups(id) on delete cascade,
  rule_id uuid references campaign.group_rules(id) on delete set null,
  -- joined | left | welcomed | deleted | warned | restricted | banned | failed
  event text not null,
  external_user_id text,
  username text not null default '',
  display_name text not null default '',
  -- The offending text, truncated.
  excerpt text not null default '',
  reason text not null default '',
  error text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists community_group_events_group_idx
  on campaign.community_group_events (group_id, occurred_at desc);
create index if not exists community_group_events_user_idx
  on campaign.community_group_events (group_id, external_user_id, occurred_at desc);
create index if not exists community_group_events_project_idx
  on campaign.community_group_events (project_id, occurred_at desc);

-- Flood control: a fixed-window message counter per (group, sender). Server-only.
create table if not exists campaign.group_flood_counters (
  project_id uuid not null references public.projects(id) on delete cascade,
  group_id uuid not null references campaign.community_groups(id) on delete cascade,
  external_user_id text not null,
  window_started_at timestamptz not null default now(),
  hits integer not null default 0,
  primary key (group_id, external_user_id)
);

create index if not exists group_flood_counters_window_idx
  on campaign.group_flood_counters (window_started_at);

-- Counts one message and returns the sender's hits in the current window (atomic upsert).
create or replace function campaign.community_flood_hit(p_project uuid, p_group uuid, p_user text, p_window_seconds integer)
returns integer
language sql
security invoker
set search_path = campaign
as $$
  insert into campaign.group_flood_counters as c (project_id, group_id, external_user_id, window_started_at, hits)
  values (p_project, p_group, p_user, now(), 1)
  on conflict (group_id, external_user_id) do update
    set hits = case
          when c.window_started_at < now() - make_interval(secs => greatest(p_window_seconds, 1)) then 1
          else c.hits + 1
        end,
        window_started_at = case
          when c.window_started_at < now() - make_interval(secs => greatest(p_window_seconds, 1)) then now()
          else c.window_started_at
        end
  returning hits;
$$;

revoke all on function campaign.community_flood_hit(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function campaign.community_flood_hit(uuid, uuid, text, integer) to service_role;

-- Join links: /j/<slug> growth CTAs that redirect to the platform and attribute clicks -> joins --

create table if not exists campaign.join_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  channel_id uuid not null references campaign.community_channels(id) on delete cascade,
  -- Lowercase; unique across the deployment and never reused, so printed links can't change target.
  slug text not null,
  name text not null default '',
  -- Redirect target: a named Telegram invite link (attributes joins) or the channel's follow URL.
  platform_url text not null default '',
  -- { source, medium, campaign, content }
  utm jsonb not null default '{}'::jsonb,
  clicks integer not null default 0,
  joins integer not null default 0,
  last_click_at timestamptz,
  last_join_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists join_links_slug_key on campaign.join_links (lower(slug));
create index if not exists join_links_project_idx
  on campaign.join_links (project_id, created_at desc)
  where deleted_at is null;
create index if not exists join_links_channel_idx
  on campaign.join_links (channel_id)
  where deleted_at is null;
create index if not exists join_links_platform_url_idx
  on campaign.join_links (platform_url)
  where deleted_at is null;

-- Atomic counter bump for the redirect route and the Telegram join handler.
create or replace function campaign.join_link_bump(p_id uuid, p_clicks integer default 0, p_joins integer default 0)
returns void
language sql
security invoker
set search_path = campaign
as $$
  update campaign.join_links
     set clicks = clicks + greatest(coalesce(p_clicks, 0), 0),
         joins = joins + greatest(coalesce(p_joins, 0), 0),
         last_click_at = case when coalesce(p_clicks, 0) > 0 then now() else last_click_at end,
         last_join_at = case when coalesce(p_joins, 0) > 0 then now() else last_join_at end
   where id = p_id;
$$;

revoke all on function campaign.join_link_bump(uuid, integer, integer) from public, anon, authenticated;
grant execute on function campaign.join_link_bump(uuid, integer, integer) to service_role;

-- Member snapshots: follower counts over time (Telegram API or entered by hand) --

create table if not exists campaign.member_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  channel_id uuid not null references campaign.community_channels(id) on delete cascade,
  count integer not null default 0,
  captured_at timestamptz not null default now(),
  -- manual | telegram_api
  source text not null default 'manual',
  note text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint member_snapshots_source_check check (source in ('manual', 'telegram_api'))
);

create index if not exists member_snapshots_project_idx
  on campaign.member_snapshots (project_id, captured_at desc)
  where deleted_at is null;
create index if not exists member_snapshots_channel_idx
  on campaign.member_snapshots (channel_id, captured_at desc)
  where deleted_at is null;

-- Access ----------------------------------------------------------------------

select campaign.apply_standard_access('community_channels', 'campaign.community.edit');
select campaign.apply_standard_access('community_posts', 'campaign.community.edit');
select campaign.apply_standard_access('community_groups', 'campaign.community.edit');
select campaign.apply_standard_access('group_rules', 'campaign.community.edit');
select campaign.apply_standard_access('community_group_events');
select campaign.apply_standard_access('join_links', 'campaign.community.edit');
select campaign.apply_standard_access('member_snapshots', 'campaign.community.edit');

alter table campaign.group_flood_counters enable row level security;
grant all on campaign.group_flood_counters to service_role;

-- @down
drop function if exists campaign.join_link_bump(uuid, integer, integer);
drop function if exists campaign.community_flood_hit(uuid, uuid, text, integer);
drop table if exists campaign.member_snapshots cascade;
drop table if exists campaign.join_links cascade;
drop table if exists campaign.group_flood_counters cascade;
drop table if exists campaign.community_group_events cascade;
drop table if exists campaign.group_rules cascade;
drop table if exists campaign.community_groups cascade;
drop table if exists campaign.community_posts cascade;
drop table if exists campaign.community_channels cascade;
