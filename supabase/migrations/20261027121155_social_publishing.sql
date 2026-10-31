-- Social publishing, moderation, listening & analytics
--
-- Owns campaign.hashtag_sets, social_posts, social_post_targets, moderation_rules, moderation_log,
-- listening_queries, listening_mentions, social_metric_snapshots, bio_pages, bio_links, plus
-- campaign.social_posts_guard_status() (approval/publish gate on post status) and
-- campaign.bio_link_click() (atomic link-in-bio click counter, service role only).
-- Posts, rules, queries and bio pages are written by members holding campaign.social.edit; the
-- moderation log, mentions and metric snapshots are server-written (webhooks, routes, worker).

-- @up
create extension if not exists pgcrypto;

create schema if not exists campaign;
grant usage on schema campaign to anon, authenticated, service_role;

-- Hashtag sets ---------------------------------------------------------------

create table if not exists campaign.hashtag_sets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled set',
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists hashtag_sets_project_idx
  on campaign.hashtag_sets (project_id, created_at desc)
  where deleted_at is null;

-- Posts ----------------------------------------------------------------------

create table if not exists campaign.social_posts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null default '',
  body text not null default '',
  -- [{ assetId, url, kind: image | video, altText }]
  media jsonb not null default '[]'::jsonb,
  -- draft | in_review | approved | scheduled | publishing | published | failed
  status text not null default 'draft',
  scheduled_at timestamptz,
  published_at timestamptz,
  first_comment text not null default '',
  hashtag_set_id uuid references campaign.hashtag_sets(id) on delete set null,
  -- { requestedAt, requestedBy, decidedAt, decidedBy, decision, note, history: [{ action, by, at, note }] }
  approval jsonb not null default '{}'::jsonb,
  campaign_id uuid references campaign.campaigns(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint social_posts_status_check check (
    status in ('draft', 'in_review', 'approved', 'scheduled', 'publishing', 'published', 'failed')
  )
);

create index if not exists social_posts_project_idx
  on campaign.social_posts (project_id, created_at desc)
  where deleted_at is null;
create index if not exists social_posts_due_idx
  on campaign.social_posts (scheduled_at)
  where status = 'scheduled' and deleted_at is null;

-- One row per (post, connected account): the per-network format, variant copy and publish outcome.
create table if not exists campaign.social_post_targets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  post_id uuid not null references campaign.social_posts(id) on delete cascade,
  connection_id uuid references campaign.channel_connections(id) on delete set null,
  -- instagram | facebook | telegram | tiktok | linkedin | x | threads | pinterest | youtube
  network text not null,
  -- feed | reel | story | carousel
  format text not null default 'feed',
  -- null = publish the post body
  variant_text text,
  -- pending | publishing | published | failed | cancelled
  status text not null default 'pending',
  external_id text,
  permalink text,
  error text,
  attempts integer not null default 0,
  published_at timestamptz,
  -- Latest insights copy (reach, views, likes, comments, shares, saves, engagement)
  metrics jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint social_post_targets_format_check check (format in ('feed', 'reel', 'story', 'carousel')),
  constraint social_post_targets_status_check check (
    status in ('pending', 'publishing', 'published', 'failed', 'cancelled')
  ),
  constraint social_post_targets_unique unique (post_id, connection_id)
);

create index if not exists social_post_targets_post_idx on campaign.social_post_targets (post_id);
create index if not exists social_post_targets_project_idx
  on campaign.social_post_targets (project_id, created_at desc)
  where deleted_at is null;
create index if not exists social_post_targets_external_idx
  on campaign.social_post_targets (external_id)
  where external_id is not null;

-- Approval and publishing gate: approving needs campaign.approval.decide; scheduling needs
-- campaign.social.publish (plus approval.decide when the post skipped review); publishing states are
-- server-only. The service role (routes, worker) is trusted and bypasses the check.
create or replace function campaign.social_posts_guard_status()
returns trigger
language plpgsql
security invoker
set search_path = public, campaign
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.status in ('publishing', 'published')
     and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    raise exception 'Only the publishing service can mark a post as published.' using errcode = '42501';
  end if;
  if new.status = 'approved'
     and (tg_op = 'INSERT' or old.status is distinct from 'approved')
     and not campaign.rbac_allows('campaign.approval.decide', new.project_id) then
    raise exception 'Approving a post needs the approval permission.' using errcode = '42501';
  end if;
  if new.status = 'scheduled'
     and (tg_op = 'INSERT' or old.status is distinct from 'scheduled' or new.scheduled_at is distinct from old.scheduled_at) then
    if not campaign.rbac_allows('campaign.social.publish', new.project_id) then
      raise exception 'Scheduling a post needs the publish permission.' using errcode = '42501';
    end if;
    if (tg_op = 'INSERT' or old.status in ('draft', 'in_review'))
       and not campaign.rbac_allows('campaign.approval.decide', new.project_id) then
      raise exception 'This post needs approval before it can be scheduled.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists social_posts_guard_status on campaign.social_posts;
create trigger social_posts_guard_status
before insert or update on campaign.social_posts
for each row execute function campaign.social_posts_guard_status();

-- Moderation -----------------------------------------------------------------

create table if not exists campaign.moderation_rules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled rule',
  -- { keywords: [], regex: [], links: bool, competitorTerms: [], ai: [spam | toxicity | negative] }
  conditions jsonb not null default '{}'::jsonb,
  -- { mode: allPosts | postIds | adsOnly | organicOnly, postIds: [] }
  scope jsonb not null default '{"mode": "allPosts", "postIds": []}'::jsonb,
  -- Networks the rule watches; empty = every connected network.
  networks text[] not null default '{}',
  -- hide | delete | reply | flag
  action text not null default 'hide',
  reply_text text not null default '',
  -- Commenter handles or external ids never actioned by this rule.
  allowlist text[] not null default '{}',
  active boolean not null default true,
  priority integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint moderation_rules_action_check check (action in ('hide', 'delete', 'reply', 'flag'))
);

create index if not exists moderation_rules_project_idx
  on campaign.moderation_rules (project_id, created_at desc)
  where deleted_at is null;

-- Audit log of every moderation action, automatic (rules) or manual (comments screen).
create table if not exists campaign.moderation_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  rule_id uuid references campaign.moderation_rules(id) on delete set null,
  connection_id uuid references campaign.channel_connections(id) on delete set null,
  network text not null default '',
  comment_external_id text not null,
  post_external_id text,
  text text not null default '',
  author text not null default '',
  author_external_id text,
  -- hide | unhide | delete | reply | flag
  action text not null,
  -- auto | manual
  source text not null default 'auto',
  -- done | failed | flagged
  status text not null default 'done',
  reason text not null default '',
  error text,
  actor_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists moderation_log_project_idx
  on campaign.moderation_log (project_id, created_at desc)
  where deleted_at is null;
create index if not exists moderation_log_comment_idx
  on campaign.moderation_log (project_id, comment_external_id);

-- Listening ------------------------------------------------------------------

create table if not exists campaign.listening_queries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled query',
  terms text[] not null default '{}',
  excluded text[] not null default '{}',
  networks text[] not null default '{instagram}',
  -- hashtags (IG hashtag search) | tags (media the account is tagged in) | comments (inbound comments)
  sources text[] not null default '{hashtags,tags,comments}',
  active boolean not null default true,
  last_run_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists listening_queries_project_idx
  on campaign.listening_queries (project_id, created_at desc)
  where deleted_at is null;

create table if not exists campaign.listening_mentions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  query_id uuid not null references campaign.listening_queries(id) on delete cascade,
  connection_id uuid references campaign.channel_connections(id) on delete set null,
  network text not null default 'instagram',
  -- hashtag_recent | hashtag_top | tag | comment
  source text not null default 'hashtag_recent',
  external_id text not null,
  text text not null default '',
  author text not null default '',
  url text,
  matched_terms text[] not null default '{}',
  -- positive | neutral | negative; null until classified
  sentiment text,
  -- { likes, comments }
  engagement jsonb not null default '{}'::jsonb,
  posted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint listening_mentions_external_key unique (query_id, network, external_id)
);

create index if not exists listening_mentions_project_idx
  on campaign.listening_mentions (project_id, posted_at desc nulls last)
  where deleted_at is null;

-- Analytics ------------------------------------------------------------------

-- Point-in-time insights: scope 'account' (connection-level) or 'post' (one published target).
create table if not exists campaign.social_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  connection_id uuid references campaign.channel_connections(id) on delete cascade,
  target_id uuid references campaign.social_post_targets(id) on delete cascade,
  network text not null default '',
  -- account | post
  scope text not null default 'account',
  metrics jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists social_metric_snapshots_project_idx
  on campaign.social_metric_snapshots (project_id, captured_at desc)
  where deleted_at is null;
create index if not exists social_metric_snapshots_connection_idx
  on campaign.social_metric_snapshots (connection_id, captured_at desc);
create index if not exists social_metric_snapshots_target_idx
  on campaign.social_metric_snapshots (target_id, captured_at desc)
  where target_id is not null;

-- Link in bio ----------------------------------------------------------------

create table if not exists campaign.bio_pages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  slug text not null,
  title text not null default '',
  bio text not null default '',
  avatar_url text not null default '',
  -- { useBrandKit: bool, buttonStyle: solid | outline, layout: stack }
  theme jsonb not null default '{}'::jsonb,
  -- draft | published
  status text not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint bio_pages_status_check check (status in ('draft', 'published'))
);

create unique index if not exists bio_pages_slug_key
  on campaign.bio_pages (lower(slug))
  where deleted_at is null;
create index if not exists bio_pages_project_idx
  on campaign.bio_pages (project_id, created_at desc)
  where deleted_at is null;

create table if not exists campaign.bio_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  page_id uuid not null references campaign.bio_pages(id) on delete cascade,
  label text not null default '',
  url text not null default '',
  position integer not null default 0,
  active boolean not null default true,
  clicks integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists bio_links_page_idx on campaign.bio_links (page_id, position);

-- Counts one outbound click and returns where to send the visitor; the public redirect route calls it.
create or replace function campaign.bio_link_click(p_link_id uuid)
returns table (url text, page_id uuid, project_id uuid)
language sql
security invoker
set search_path = campaign
as $$
  update campaign.bio_links l
     set clicks = l.clicks + 1
   where l.id = p_link_id
     and l.active
     and l.deleted_at is null
  returning l.url, l.page_id, l.project_id;
$$;

revoke all on function campaign.bio_link_click(uuid) from public, anon, authenticated;
grant execute on function campaign.bio_link_click(uuid) to service_role;

-- Access ---------------------------------------------------------------------

select campaign.apply_standard_access('hashtag_sets', 'campaign.social.edit');
select campaign.apply_standard_access('social_posts', 'campaign.social.edit');
select campaign.apply_standard_access('social_post_targets', 'campaign.social.edit');
select campaign.apply_standard_access('moderation_rules', 'campaign.social.edit');
select campaign.apply_standard_access('moderation_log');
select campaign.apply_standard_access('listening_queries', 'campaign.social.edit');
select campaign.apply_standard_access('listening_mentions');
select campaign.apply_standard_access('social_metric_snapshots');
select campaign.apply_standard_access('bio_pages', 'campaign.social.edit');
select campaign.apply_standard_access('bio_links', 'campaign.social.edit');

-- @down
drop function if exists campaign.bio_link_click(uuid);
drop table if exists campaign.bio_links cascade;
drop table if exists campaign.bio_pages cascade;
drop table if exists campaign.social_metric_snapshots cascade;
drop table if exists campaign.listening_mentions cascade;
drop table if exists campaign.listening_queries cascade;
drop table if exists campaign.moderation_log cascade;
drop table if exists campaign.moderation_rules cascade;
drop table if exists campaign.social_post_targets cascade;
drop table if exists campaign.social_posts cascade;
drop function if exists campaign.social_posts_guard_status();
drop table if exists campaign.hashtag_sets cascade;
