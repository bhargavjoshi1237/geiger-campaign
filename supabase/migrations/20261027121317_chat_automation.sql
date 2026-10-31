-- Chat automation
--
-- Comment-to-DM, keyword / story / welcome / default-reply / referral automations, DM flows, chat
-- sequences, AI agents, entry points and handover rules, plus the guardrail state the engine enforces.
-- Owns:
--   tables     campaign.chat_automations, dm_flows, dm_flow_sessions, chat_sequences, chat_sequence_steps,
--              chat_sequence_enrollments, ai_agents, entry_points, handover_rules, chat_rate_limits, chat_outbox
--   functions  campaign.chat_bump_stats(), chat_claim_dm_slot(), chat_release_dm_slot(), chat_bump_entry()
-- Builder tables need campaign.chat.edit to write; sessions, rate limits and the outbox are server-written
-- (lib/chat on the service role) and member-readable.

-- @up
create extension if not exists pgcrypto;
create schema if not exists campaign;
grant usage on schema campaign to anon, authenticated, service_role;

-- Automations: one trigger -> one response (public reply, private DM, flow, tags) ------------------

create table if not exists campaign.chat_automations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled automation',
  description text not null default '',
  -- comment_to_dm | keyword | story_reply | story_mention | welcome | default_reply | referral
  kind text not null default 'keyword',
  -- draft | active | paused | archived
  status text not null default 'draft',
  -- Lower runs first when two automations of the same kind match.
  priority integer not null default 100,
  channels text[] not null default '{}',
  connection_ids uuid[] not null default '{}',
  -- { allPosts, postIds, posts: [{ id, caption, permalink, thumbnailUrl }], includeAds, adIds, keywords, match: exact|contains|any, refs }
  trigger jsonb not null default '{}'::jsonb,
  -- { publicReplies: [text], dm: { text, buttons: [{ id, type, title, url }], flowId }, tags, removeTags, fields: [{ key, value }], sequenceId }
  actions jsonb not null default '{}'::jsonb,
  -- { quietHours: { enabled, start, end, timezone, behavior: queue|skip }, oncePerPost }
  guardrails jsonb not null default '{}'::jsonb,
  -- Engine counters: { triggered, publicReplies, dmsSent, dmsBlocked, queued }
  stats jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  last_triggered_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chat_automations_kind_check check (
    kind in ('comment_to_dm', 'keyword', 'story_reply', 'story_mention', 'welcome', 'default_reply', 'referral')
  ),
  constraint chat_automations_status_check check (status in ('draft', 'active', 'paused', 'archived'))
);

create index if not exists chat_automations_project_idx
  on campaign.chat_automations (project_id, created_at desc)
  where deleted_at is null;
create index if not exists chat_automations_active_idx
  on campaign.chat_automations (project_id, kind, priority)
  where status = 'active' and deleted_at is null;

-- DM flows: node graphs (message, wait for reply, condition, tag/field, AI step, handover, jump) ---------

create table if not exists campaign.dm_flows (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled flow',
  description text not null default '',
  -- draft | active | paused | archived
  status text not null default 'draft',
  channels text[] not null default '{}',
  -- Working copy edited on the canvas: { nodes, edges, viewport }
  graph jsonb not null default '{"nodes": [], "edges": []}'::jsonb,
  -- Snapshot taken on publish; live sessions run this, so edits never reach people until republished.
  published_graph jsonb,
  -- { nodeId } of the start node
  entry jsonb not null default '{}'::jsonb,
  -- { handoverLabel, replyTimeoutMinutes, fallbackText }
  settings jsonb not null default '{}'::jsonb,
  -- { started, completed, handedOver, expired, goals }
  stats jsonb not null default '{}'::jsonb,
  version integer not null default 0,
  published_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint dm_flows_status_check check (status in ('draft', 'active', 'paused', 'archived'))
);

create index if not exists dm_flows_project_idx
  on campaign.dm_flows (project_id, created_at desc)
  where deleted_at is null;

-- Flow sessions: where one conversation is inside one flow (server-written) --------------------------

create table if not exists campaign.dm_flow_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  flow_id uuid not null references campaign.dm_flows(id) on delete cascade,
  conversation_id uuid references campaign.conversations(id) on delete cascade,
  contact_id uuid references campaign.contacts(id) on delete set null,
  channel text not null default 'instagram',
  connection_id uuid,
  current_node_id text,
  -- none | reply | buttons | delay | ai
  waiting_for text not null default 'none',
  -- Reply timeout, or when a delay node resumes.
  expires_at timestamptz,
  -- { vars, answers, path: [nodeId], retries, aiTurns, source: { type, id } }
  context jsonb not null default '{}'::jsonb,
  -- active | waiting | completed | handed_over | expired | cancelled | failed
  status text not null default 'active',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint dm_flow_sessions_status_check check (
    status in ('active', 'waiting', 'completed', 'handed_over', 'expired', 'cancelled', 'failed')
  )
);

create index if not exists dm_flow_sessions_conversation_idx
  on campaign.dm_flow_sessions (conversation_id)
  where status in ('active', 'waiting');
create index if not exists dm_flow_sessions_due_idx
  on campaign.dm_flow_sessions (expires_at)
  where status = 'waiting';
create index if not exists dm_flow_sessions_flow_idx on campaign.dm_flow_sessions (flow_id, status);
create index if not exists dm_flow_sessions_project_idx on campaign.dm_flow_sessions (project_id, created_at desc);

-- Chat sequences: timed follow-ups inside the messaging window --------------------------------------

create table if not exists campaign.chat_sequences (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled sequence',
  description text not null default '',
  -- draft | active | paused | archived
  status text not null default 'draft',
  channels text[] not null default '{}',
  -- { type: manual|automation|flow_completed|tag_added, automationId, flowId, tag }
  trigger jsonb not null default '{}'::jsonb,
  -- { stopOnReply, quietHours }
  settings jsonb not null default '{}'::jsonb,
  -- { enrolled, completed, stopped, sent, blocked }
  stats jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chat_sequences_status_check check (status in ('draft', 'active', 'paused', 'archived'))
);

create index if not exists chat_sequences_project_idx
  on campaign.chat_sequences (project_id, created_at desc)
  where deleted_at is null;

create table if not exists campaign.chat_sequence_steps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  sequence_id uuid not null references campaign.chat_sequences(id) on delete cascade,
  position integer not null default 0,
  -- Wait after the previous step (or enrollment, for the first step).
  delay_minutes integer not null default 0,
  -- { text, buttons: [{ id, type, title, url }] }
  message jsonb not null default '{}'::jsonb,
  -- WhatsApp only, for a step that lands outside the 24h window: { name, language }
  template jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists chat_sequence_steps_sequence_idx
  on campaign.chat_sequence_steps (sequence_id, position)
  where deleted_at is null;

create table if not exists campaign.chat_sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  sequence_id uuid not null references campaign.chat_sequences(id) on delete cascade,
  contact_id uuid not null references campaign.contacts(id) on delete cascade,
  conversation_id uuid references campaign.conversations(id) on delete set null,
  channel text not null default 'instagram',
  connection_id uuid,
  -- Index of the next step to send.
  current_step integer not null default 0,
  next_run_at timestamptz,
  -- active | completed | stopped | blocked | failed
  status text not null default 'active',
  stop_reason text,
  last_sent_at timestamptz,
  -- { type, id } of what enrolled the contact
  source jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chat_sequence_enrollments_status_check check (status in ('active', 'completed', 'stopped', 'blocked', 'failed'))
);

create unique index if not exists chat_sequence_enrollments_running_key
  on campaign.chat_sequence_enrollments (sequence_id, contact_id)
  where status = 'active' and deleted_at is null;
create index if not exists chat_sequence_enrollments_due_idx
  on campaign.chat_sequence_enrollments (next_run_at)
  where status = 'active' and deleted_at is null;
create index if not exists chat_sequence_enrollments_project_idx
  on campaign.chat_sequence_enrollments (project_id, created_at desc)
  where deleted_at is null;

-- AI agents: persona + knowledge answering DMs, handing over when unsure -----------------------------

create table if not exists campaign.ai_agents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled agent',
  description text not null default '',
  -- draft | active | paused | archived
  status text not null default 'draft',
  persona text not null default '',
  instructions text not null default '',
  -- [{ id, type: text|url, title, content, url, fetchedAt, error }]
  knowledge jsonb not null default '[]'::jsonb,
  channels text[] not null default '{}',
  -- { minConfidence, intents, keywords, onNegativeSentiment, maxTurns, message }
  handover_triggers jsonb not null default '{}'::jsonb,
  -- { temperature, maxReplyChars, language }
  model_settings jsonb not null default '{}'::jsonb,
  -- { replies, handovers }
  stats jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint ai_agents_status_check check (status in ('draft', 'active', 'paused', 'archived'))
);

create index if not exists ai_agents_project_idx
  on campaign.ai_agents (project_id, created_at desc)
  where deleted_at is null;

-- Entry points: ref links, QR codes, website widgets and click-to-message ads -------------------------

create table if not exists campaign.entry_points (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled entry point',
  -- ref_link | qr | website_widget | ctwa
  kind text not null default 'ref_link',
  channel text not null default 'instagram',
  connection_id uuid references campaign.channel_connections(id) on delete set null,
  -- The ref the platform hands back on the referral webhook (ig.me / m.me ?ref=, t.me ?start=, wa.me prefilled text).
  ref text not null default '',
  -- The deep link people land on.
  url text not null default '',
  flow_id uuid references campaign.dm_flows(id) on delete set null,
  automation_id uuid references campaign.chat_automations(id) on delete set null,
  -- active | paused
  status text not null default 'active',
  scans integer not null default 0,
  clicks integer not null default 0,
  conversations integer not null default 0,
  -- { track, prefill, widget: { label, position }, adIds, utm }
  config jsonb not null default '{}'::jsonb,
  last_scanned_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint entry_points_kind_check check (kind in ('ref_link', 'qr', 'website_widget', 'ctwa')),
  constraint entry_points_status_check check (status in ('active', 'paused'))
);

create unique index if not exists entry_points_ref_key
  on campaign.entry_points (project_id, channel, ref)
  where deleted_at is null and ref <> '';
create index if not exists entry_points_project_idx
  on campaign.entry_points (project_id, created_at desc)
  where deleted_at is null;

-- Handover rules: when the bot steps aside and who picks the conversation up --------------------------

create table if not exists campaign.handover_rules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled rule',
  description text not null default '',
  -- active | paused
  status text not null default 'active',
  priority integer not null default 100,
  channels text[] not null default '{}',
  -- { match: any|all, keywords, sentiment: negative, noMatchCount, vipTags, aiConfidenceBelow }
  conditions jsonb not null default '{}'::jsonb,
  -- { assigneeId, team, priority, notify, pauseBot, message }
  action jsonb not null default '{}'::jsonb,
  -- { fired }
  stats jsonb not null default '{}'::jsonb,
  last_fired_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint handover_rules_status_check check (status in ('active', 'paused'))
);

create index if not exists handover_rules_project_idx
  on campaign.handover_rules (project_id, priority)
  where deleted_at is null;

-- Rate limits: the platform's one-automated-DM-per-user-per-24h cap for comment/story triggers ---------

create table if not exists campaign.chat_rate_limits (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  contact_id uuid references campaign.contacts(id) on delete cascade,
  channel text not null,
  -- contact id, or "ext:<platform user id>" before a contact exists
  subject text not null,
  last_automated_dm_at timestamptz,
  count_24h integer not null default 0,
  blocked_24h integer not null default 0,
  window_started_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists chat_rate_limits_subject_key
  on campaign.chat_rate_limits (project_id, channel, subject);
create index if not exists chat_rate_limits_contact_idx on campaign.chat_rate_limits (contact_id);

-- Outbox: automated replies deferred by quiet hours or scheduled follow-ups (server-written) ------------

create table if not exists campaign.chat_outbox (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  conversation_id uuid references campaign.conversations(id) on delete cascade,
  contact_id uuid references campaign.contacts(id) on delete set null,
  channel text not null,
  connection_id uuid,
  to_address text not null,
  -- The dispatch message: { text, buttons, recipient }
  message jsonb not null default '{}'::jsonb,
  -- { type: automation|flow|sequence, id, kind }
  source jsonb not null default '{}'::jsonb,
  send_after timestamptz not null default now(),
  -- The messaging window closes here; a send after it is skipped, never forced.
  expires_at timestamptz,
  -- queued | sent | failed | skipped | cancelled
  status text not null default 'queued',
  reason text,
  attempts integer not null default 0,
  delivery_id uuid references campaign.deliveries(id) on delete set null,
  sent_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chat_outbox_status_check check (status in ('queued', 'sent', 'failed', 'skipped', 'cancelled'))
);

create index if not exists chat_outbox_due_idx
  on campaign.chat_outbox (send_after)
  where status = 'queued';
create index if not exists chat_outbox_project_idx on campaign.chat_outbox (project_id, created_at desc);

-- Functions ------------------------------------------------------------------------------------------

-- Adds numeric increments into a chat table's stats bag atomically: chat_bump_stats('chat_automations', id, '{"dmsSent": 1}').
create or replace function campaign.chat_bump_stats(p_table text, p_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
set search_path = campaign
as $$
declare
  merged jsonb;
begin
  if p_table not in ('chat_automations', 'dm_flows', 'chat_sequences', 'ai_agents', 'handover_rules') then
    raise exception 'chat_bump_stats: unsupported table %', p_table;
  end if;
  execute format(
    'update campaign.%I t set stats = coalesce(t.stats, ''{}''::jsonb) || (
       select coalesce(jsonb_object_agg(k.key, coalesce((t.stats ->> k.key)::numeric, 0) + k.value::numeric), ''{}''::jsonb)
       from jsonb_each_text(coalesce($1, ''{}''::jsonb)) k
     ) where t.id = $2 returning t.stats',
    p_table
  )
  into merged
  using p_patch, p_id;
  return merged;
end;
$$;

-- Claims the contact's automated-DM slot for 24h; returns the claim time, or null when the cap is spent.
create or replace function campaign.chat_claim_dm_slot(p_project uuid, p_channel text, p_subject text, p_contact uuid)
returns timestamptz
language plpgsql
set search_path = campaign
as $$
declare
  claimed timestamptz;
begin
  insert into campaign.chat_rate_limits as r
    (project_id, channel, subject, contact_id, last_automated_dm_at, count_24h, window_started_at)
  values (p_project, p_channel, p_subject, p_contact, now(), 1, now())
  on conflict (project_id, channel, subject) do update
    set last_automated_dm_at = now(),
        count_24h = case when r.window_started_at is null or r.window_started_at < now() - interval '24 hours'
          then 1 else r.count_24h + 1 end,
        blocked_24h = case when r.window_started_at is null or r.window_started_at < now() - interval '24 hours'
          then 0 else r.blocked_24h end,
        window_started_at = case when r.window_started_at is null or r.window_started_at < now() - interval '24 hours'
          then now() else r.window_started_at end,
        contact_id = coalesce(excluded.contact_id, r.contact_id),
        updated_at = now()
    where r.last_automated_dm_at is null or r.last_automated_dm_at < now() - interval '24 hours'
  returning r.last_automated_dm_at into claimed;

  if claimed is null then
    update campaign.chat_rate_limits
      set blocked_24h = blocked_24h + 1, updated_at = now()
      where project_id = p_project and channel = p_channel and subject = p_subject;
  end if;
  return claimed;
end;
$$;

-- Gives a slot back when the claimed send never left (provider failure), so a failure doesn't burn the person's 24h.
create or replace function campaign.chat_release_dm_slot(p_project uuid, p_channel text, p_subject text, p_claimed timestamptz)
returns boolean
language plpgsql
set search_path = campaign
as $$
begin
  update campaign.chat_rate_limits
    set last_automated_dm_at = null, count_24h = greatest(count_24h - 1, 0), updated_at = now()
    where project_id = p_project and channel = p_channel and subject = p_subject and last_automated_dm_at = p_claimed;
  return found;
end;
$$;

-- Counts a scan / click / started conversation on an entry point.
create or replace function campaign.chat_bump_entry(p_id uuid, p_field text)
returns void
language plpgsql
set search_path = campaign
as $$
begin
  if p_field = 'scans' then
    update campaign.entry_points set scans = scans + 1, last_scanned_at = now() where id = p_id and deleted_at is null;
  elsif p_field = 'clicks' then
    update campaign.entry_points set clicks = clicks + 1, last_scanned_at = now() where id = p_id and deleted_at is null;
  elsif p_field = 'conversations' then
    update campaign.entry_points set conversations = conversations + 1 where id = p_id and deleted_at is null;
  end if;
end;
$$;

revoke all on function campaign.chat_bump_stats(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function campaign.chat_claim_dm_slot(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function campaign.chat_release_dm_slot(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function campaign.chat_bump_entry(uuid, text) from public, anon, authenticated;
grant execute on function campaign.chat_bump_stats(text, uuid, jsonb) to service_role;
grant execute on function campaign.chat_claim_dm_slot(uuid, text, text, uuid) to service_role;
grant execute on function campaign.chat_release_dm_slot(uuid, text, text, timestamptz) to service_role;
grant execute on function campaign.chat_bump_entry(uuid, text) to service_role;

-- Access ---------------------------------------------------------------------------------------------

select campaign.apply_standard_access('chat_automations', 'campaign.chat.edit');
select campaign.apply_standard_access('dm_flows', 'campaign.chat.edit');
select campaign.apply_standard_access('dm_flow_sessions');
select campaign.apply_standard_access('chat_sequences', 'campaign.chat.edit');
select campaign.apply_standard_access('chat_sequence_steps', 'campaign.chat.edit');
select campaign.apply_standard_access('chat_sequence_enrollments', 'campaign.chat.edit');
select campaign.apply_standard_access('ai_agents', 'campaign.chat.edit');
select campaign.apply_standard_access('entry_points', 'campaign.chat.edit');
select campaign.apply_standard_access('handover_rules', 'campaign.chat.edit');
select campaign.apply_standard_access('chat_rate_limits');
select campaign.apply_standard_access('chat_outbox');

-- @down
drop function if exists campaign.chat_bump_entry(uuid, text);
drop function if exists campaign.chat_release_dm_slot(uuid, text, text, timestamptz);
drop function if exists campaign.chat_claim_dm_slot(uuid, text, text, uuid);
drop function if exists campaign.chat_bump_stats(text, uuid, jsonb);
drop table if exists campaign.chat_outbox cascade;
drop table if exists campaign.chat_rate_limits cascade;
drop table if exists campaign.handover_rules cascade;
drop table if exists campaign.entry_points cascade;
drop table if exists campaign.ai_agents cascade;
drop table if exists campaign.chat_sequence_enrollments cascade;
drop table if exists campaign.chat_sequence_steps cascade;
drop table if exists campaign.chat_sequences cascade;
drop table if exists campaign.dm_flow_sessions cascade;
drop table if exists campaign.dm_flows cascade;
drop table if exists campaign.chat_automations cascade;
