-- Creators, influencers & UGC
--
-- Owns:
--   tables     campaign.creators, payouts, affiliate_links, affiliate_conversions, collaborations,
--              ugc_items, creator_outreach, creator_outreach_recipients, creator_outreach_steps_log,
--              creator_worker_cursors (server-only)
--   functions  campaign.affiliate_link_click()
-- Writes need campaign.creator.manage; the creators worker, the affiliate redirect (/a/<code>) and the
-- public opt-out / rights pages write through the service role. Assets (Acquisition & Content) and
-- coupons (Commerce) are referenced by plain uuid because their migrations may run after this one.

-- @up
create extension if not exists pgcrypto;

create schema if not exists campaign;
grant usage on schema campaign to anon, authenticated, service_role;

-- Creators: the project's own creator database (discovery, outreach, collaborations) --

create table if not exists campaign.creators (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default '',
  email text,
  -- { instagram, tiktok, youtube, x, twitch, website } — handles without the leading @
  handles jsonb not null default '{}'::jsonb,
  niches text[] not null default '{}',
  location text not null default '',
  avatar_url text,
  -- { network, followers, engagementRate, avgLikes, avgComments, mediaCount, postsSampled, source: business_discovery | manual, refreshedAt, recentPosts }
  audience jsonb not null default '{}'::jsonb,
  -- prospect | contacted | active | paused | declined
  status text not null default 'prospect',
  -- { currency, items: [{ id, deliverable, price }] }
  rate_card jsonb not null default '{}'::jsonb,
  contact_id uuid references campaign.contacts(id) on delete set null,
  notes text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint creators_status_check check (status in ('prospect', 'contacted', 'active', 'paused', 'declined'))
);

create index if not exists creators_project_idx
  on campaign.creators (project_id, created_at desc)
  where deleted_at is null;
create unique index if not exists creators_project_instagram_key
  on campaign.creators (project_id, lower(handles ->> 'instagram'))
  where deleted_at is null and coalesce(handles ->> 'instagram', '') <> '';
create index if not exists creators_niches_idx on campaign.creators using gin (niches);
create index if not exists creators_contact_idx on campaign.creators (contact_id) where contact_id is not null;

-- Payouts: one ledger row per creator, period and currency (no payment rails — paid outside, recorded here) --

create table if not exists campaign.payouts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  creator_id uuid not null references campaign.creators(id) on delete cascade,
  -- Calendar month the payout covers: 'YYYY-MM'
  period text not null,
  amount numeric(14, 2) not null default 0,
  currency text not null default 'USD',
  -- pending | approved | paid
  status text not null default 'pending',
  -- { conversions: { count, commission, revenue }, collaborations: [{ id, campaignName, fee }] }
  lines jsonb not null default '{}'::jsonb,
  method text not null default '',
  reference text not null default '',
  notes text not null default '',
  approved_at timestamptz,
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint payouts_status_check check (status in ('pending', 'approved', 'paid')),
  constraint payouts_period_check check (period ~ '^\d{4}-\d{2}$')
);

create index if not exists payouts_project_idx
  on campaign.payouts (project_id, created_at desc)
  where deleted_at is null;
create index if not exists payouts_creator_idx on campaign.payouts (creator_id, period);

-- Affiliate links: /a/<code> redirects with creator attribution, optional discount code --

create table if not exists campaign.affiliate_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  creator_id uuid not null references campaign.creators(id) on delete cascade,
  -- Globally unique: the public redirect carries no project id.
  code text not null,
  name text not null default '',
  destination_url text not null default '',
  discount_code text,
  -- campaign.coupons (Commerce), when the discount code is a Commerce coupon.
  coupon_id uuid,
  -- { kind: percent | flat, value, holdDays }
  commission jsonb not null default '{"kind": "percent", "value": 10}'::jsonb,
  currency text not null default 'USD',
  attribution_window_days integer not null default 30,
  -- active | paused
  status text not null default 'active',
  -- Rollups: clicks from the redirect, the rest recomputed by the attribution sweep.
  clicks integer not null default 0,
  conversions integer not null default 0,
  revenue numeric(14, 2) not null default 0,
  commission_earned numeric(14, 2) not null default 0,
  last_click_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint affiliate_links_status_check check (status in ('active', 'paused')),
  constraint affiliate_links_code_check check (code ~ '^[A-Za-z0-9_-]{2,40}$'),
  constraint affiliate_links_window_check check (attribution_window_days between 1 and 365)
);

create unique index if not exists affiliate_links_code_key
  on campaign.affiliate_links (lower(code))
  where deleted_at is null;
create index if not exists affiliate_links_project_idx
  on campaign.affiliate_links (project_id, created_at desc)
  where deleted_at is null;
create index if not exists affiliate_links_creator_idx on campaign.affiliate_links (creator_id);
create index if not exists affiliate_links_discount_idx
  on campaign.affiliate_links (project_id, upper(discount_code))
  where discount_code is not null and deleted_at is null;

-- Affiliate conversions: orders attributed to a link, with the commission they earn --

create table if not exists campaign.affiliate_conversions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  affiliate_link_id uuid not null references campaign.affiliate_links(id) on delete cascade,
  creator_id uuid references campaign.creators(id) on delete set null,
  tracked_event_id uuid references campaign.tracked_events(id) on delete set null,
  contact_id uuid references campaign.contacts(id) on delete set null,
  order_external_id text,
  revenue numeric(14, 2) not null default 0,
  commission numeric(14, 2) not null default 0,
  currency text not null default 'USD',
  -- code | discount_code | utm | cookie | click
  attributed_via text not null default 'code',
  -- pending | approved | paid | rejected
  status text not null default 'pending',
  payout_id uuid references campaign.payouts(id) on delete set null,
  occurred_at timestamptz not null default now(),
  approved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint affiliate_conversions_status_check check (status in ('pending', 'approved', 'paid', 'rejected'))
);

create unique index if not exists affiliate_conversions_event_key
  on campaign.affiliate_conversions (tracked_event_id)
  where tracked_event_id is not null;
create unique index if not exists affiliate_conversions_order_key
  on campaign.affiliate_conversions (project_id, order_external_id)
  where order_external_id is not null and deleted_at is null;
create index if not exists affiliate_conversions_project_idx
  on campaign.affiliate_conversions (project_id, occurred_at desc)
  where deleted_at is null;
create index if not exists affiliate_conversions_link_idx on campaign.affiliate_conversions (affiliate_link_id);
create index if not exists affiliate_conversions_payout_idx
  on campaign.affiliate_conversions (payout_id)
  where payout_id is not null;

-- Collaborations: brief, deliverables, contract and fee for one creator on one campaign --

create table if not exists campaign.collaborations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  creator_id uuid not null references campaign.creators(id) on delete cascade,
  campaign_name text not null default '',
  -- planned | active | in_review | completed | cancelled
  status text not null default 'planned',
  -- { objective, keyMessages, dos, donts, hashtags, mentions, linkUrl, discountCode, usageRights }
  brief jsonb not null default '{}'::jsonb,
  -- [{ id, kind, network, due_at, status: pending | submitted | approved | live, url, notes }]
  deliverables jsonb not null default '[]'::jsonb,
  -- { terms, status: draft | sent | signed, sent_at, signed_at, signed_by }
  contract jsonb not null default '{"status": "draft"}'::jsonb,
  fee numeric(14, 2) not null default 0,
  currency text not null default 'USD',
  starts_on date,
  ends_on date,
  affiliate_link_id uuid references campaign.affiliate_links(id) on delete set null,
  send_reminders boolean not null default true,
  completed_at timestamptz,
  payout_id uuid references campaign.payouts(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint collaborations_status_check check (status in ('planned', 'active', 'in_review', 'completed', 'cancelled'))
);

create index if not exists collaborations_project_idx
  on campaign.collaborations (project_id, created_at desc)
  where deleted_at is null;
create index if not exists collaborations_creator_idx on campaign.collaborations (creator_id);
create index if not exists collaborations_open_idx
  on campaign.collaborations (status)
  where deleted_at is null and status in ('planned', 'active', 'in_review');

-- UGC: creator and customer content with usage rights, expiry and whitelisting --

create table if not exists campaign.ugc_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  creator_id uuid references campaign.creators(id) on delete set null,
  collaboration_id uuid references campaign.collaborations(id) on delete set null,
  title text not null default '',
  source_url text not null default '',
  -- instagram | tiktok | youtube | x | website | other
  network text not null default 'instagram',
  author_handle text not null default '',
  -- image | video | reel | story | post | review | other
  kind text not null default 'post',
  -- campaign.assets (Acquisition & Content) the content was saved to.
  asset_id uuid,
  asset_url text,
  thumbnail_url text,
  caption text not null default '',
  -- not_requested | requested | granted | denied | expired
  rights_status text not null default 'not_requested',
  rights_requested_at timestamptz,
  rights_granted_at timestamptz,
  rights_expires_at timestamptz,
  -- organic | paid | email | website | ooh
  usage_channels text[] not null default '{}',
  whitelisting boolean not null default false,
  usage_notes text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint ugc_items_rights_check check (rights_status in ('not_requested', 'requested', 'granted', 'denied', 'expired'))
);

create index if not exists ugc_items_project_idx
  on campaign.ugc_items (project_id, created_at desc)
  where deleted_at is null;
create index if not exists ugc_items_creator_idx on campaign.ugc_items (creator_id);
create index if not exists ugc_items_expiry_idx
  on campaign.ugc_items (rights_expires_at)
  where rights_status = 'granted' and rights_expires_at is not null and deleted_at is null;

-- Outreach: multi-step email sequences to creators, stopped on reply or opt-out --

create table if not exists campaign.creator_outreach (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled sequence',
  -- draft | active | paused | completed
  status text not null default 'draft',
  -- [{ id, delayDays, subject, body }]: step 1 waits from start, later steps from the previous send
  steps jsonb not null default '[]'::jsonb,
  creator_ids uuid[] not null default '{}',
  -- { fromName, fromEmail, replyTo }
  sender jsonb not null default '{}'::jsonb,
  stop_on_reply boolean not null default true,
  -- Rollups: { enrolled, active, sent, failed, replied, optedOut, completed }
  stats jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint creator_outreach_status_check check (status in ('draft', 'active', 'paused', 'completed'))
);

create index if not exists creator_outreach_project_idx
  on campaign.creator_outreach (project_id, created_at desc)
  where deleted_at is null;
create index if not exists creator_outreach_active_idx
  on campaign.creator_outreach (status)
  where status = 'active' and deleted_at is null;

-- One row per creator enrolled in a sequence: where they are and why they stopped.
create table if not exists campaign.creator_outreach_recipients (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  outreach_id uuid not null references campaign.creator_outreach(id) on delete cascade,
  creator_id uuid not null references campaign.creators(id) on delete cascade,
  -- active | replied | opted_out | completed | stopped | failed
  status text not null default 'active',
  -- 0-based index of the next step to send.
  next_step integer not null default 0,
  next_due_at timestamptz,
  last_sent_at timestamptz,
  replied_at timestamptz,
  stopped_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint creator_outreach_recipients_unique unique (outreach_id, creator_id),
  constraint creator_outreach_recipients_status_check check (
    status in ('active', 'replied', 'opted_out', 'completed', 'stopped', 'failed')
  )
);

create index if not exists creator_outreach_recipients_due_idx
  on campaign.creator_outreach_recipients (next_due_at)
  where status = 'active' and deleted_at is null;
create index if not exists creator_outreach_recipients_creator_idx on campaign.creator_outreach_recipients (creator_id);

-- Append-only per-step history: sends, failures, replies and opt-outs.
create table if not exists campaign.creator_outreach_steps_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  outreach_id uuid not null references campaign.creator_outreach(id) on delete cascade,
  recipient_id uuid references campaign.creator_outreach_recipients(id) on delete cascade,
  creator_id uuid references campaign.creators(id) on delete set null,
  step_index integer not null default 0,
  -- sent | failed | not_sent | replied | opted_out | stopped | completed
  event text not null default 'sent',
  delivery_id uuid references campaign.deliveries(id) on delete set null,
  subject text,
  error text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists creator_outreach_steps_log_outreach_idx
  on campaign.creator_outreach_steps_log (outreach_id, occurred_at desc);
create index if not exists creator_outreach_steps_log_project_idx
  on campaign.creator_outreach_steps_log (project_id, occurred_at desc);

-- Server-only cursors for the creators worker's incremental sweeps (no client access).
create table if not exists campaign.creator_worker_cursors (
  job text primary key,
  cursor_at timestamptz,
  cursor_id uuid,
  updated_at timestamptz not null default now()
);

-- Atomic click counter for the affiliate redirect (service role only).
create or replace function campaign.affiliate_link_click(p_link uuid)
returns void
language sql
security invoker
set search_path = campaign
as $$
  update campaign.affiliate_links
  set clicks = clicks + 1, last_click_at = now()
  where id = p_link and deleted_at is null;
$$;

revoke all on function campaign.affiliate_link_click(uuid) from public, anon, authenticated;
grant execute on function campaign.affiliate_link_click(uuid) to service_role;

-- Access ----------------------------------------------------------------------

select campaign.apply_standard_access('creators', 'campaign.creator.manage');
select campaign.apply_standard_access('payouts', 'campaign.creator.manage');
select campaign.apply_standard_access('affiliate_links', 'campaign.creator.manage');
select campaign.apply_standard_access('affiliate_conversions', 'campaign.creator.manage');
select campaign.apply_standard_access('collaborations', 'campaign.creator.manage');
select campaign.apply_standard_access('ugc_items', 'campaign.creator.manage');
select campaign.apply_standard_access('creator_outreach', 'campaign.creator.manage');
select campaign.apply_standard_access('creator_outreach_recipients', 'campaign.creator.manage');
select campaign.apply_standard_access('creator_outreach_steps_log', 'campaign.creator.manage');

alter table campaign.creator_worker_cursors enable row level security;
grant all on campaign.creator_worker_cursors to service_role;

-- @down
drop function if exists campaign.affiliate_link_click(uuid);
drop table if exists campaign.creator_worker_cursors cascade;
drop table if exists campaign.creator_outreach_steps_log cascade;
drop table if exists campaign.creator_outreach_recipients cascade;
drop table if exists campaign.creator_outreach cascade;
drop table if exists campaign.ugc_items cascade;
drop table if exists campaign.collaborations cascade;
drop table if exists campaign.affiliate_conversions cascade;
drop table if exists campaign.affiliate_links cascade;
drop table if exists campaign.payouts cascade;
drop table if exists campaign.creators cascade;
