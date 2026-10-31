-- Ads
--
-- Meta ads inside Campaign: connected ad accounts, Marketing API snapshots and automated rules,
-- Click-to-Message ads mapped to DM flows, Lead Ads forms, Custom Audience syncs from segments, the
-- Conversions API forwarder (website + business_messaging), the creative library and ad-comment routing.
-- Owns:
--   tables  campaign.ad_accounts, ad_account_secrets, ad_campaign_snapshots, ad_rules, ad_creatives,
--           ctwa_ads, lead_forms, audience_syncs, capi_configs, capi_secrets, capi_events, ad_comment_rules
-- Writes need campaign.ads.manage; snapshots and the CAPI delivery log are server-written (service role).
-- Tokens live only in ad_account_secrets / capi_secrets (RLS on, no client policy).

-- @up
create extension if not exists pgcrypto;

create schema if not exists campaign;
grant usage on schema campaign to anon, authenticated, service_role;

-- Ad accounts -----------------------------------------------------------------

create table if not exists campaign.ad_accounts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- Meta ad account id with the act_ prefix.
  external_id text not null,
  name text not null default '',
  currency text not null default 'USD',
  timezone text not null default 'UTC',
  -- connected | pending | error | disconnected
  status text not null default 'pending',
  -- Meta account_status: 1 active, 2 disabled, 3 unsettled, 7 pending review, 9 grace period, 101 closed.
  account_status integer,
  business_id text,
  business_name text not null default '',
  page_ids text[] not null default '{}',
  -- [{ id, name, igUserId, igUsername }] pages the token manages.
  pages jsonb not null default '[]'::jsonb,
  -- oauth | system_user
  token_kind text not null default 'oauth',
  scopes text[] not null default '{}',
  token_expires_at timestamptz,
  connected_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint ad_accounts_external_key unique (project_id, external_id),
  constraint ad_accounts_status_check check (status in ('connected', 'pending', 'error', 'disconnected'))
);

create index if not exists ad_accounts_project_idx
  on campaign.ad_accounts (project_id, created_at desc)
  where deleted_at is null;

-- User/system-user token + page tokens. Service role only.
create table if not exists campaign.ad_account_secrets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  ad_account_id uuid not null unique references campaign.ad_accounts(id) on delete cascade,
  -- { accessToken, pageTokens: { <pageId>: token } }
  secrets jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Marketing API snapshots: latest state + insights per campaign / ad set / ad --

create table if not exists campaign.ad_campaign_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  ad_account_id uuid not null references campaign.ad_accounts(id) on delete cascade,
  -- campaign | adset | ad
  level text not null,
  external_id text not null,
  external_campaign_id text,
  external_adset_id text,
  name text not null default '',
  -- Configured status (ACTIVE | PAUSED | ARCHIVED) and Meta's effective_status.
  status text not null default '',
  effective_status text not null default '',
  objective text not null default '',
  destination_type text not null default '',
  optimization_goal text not null default '',
  daily_budget numeric(14, 2),
  lifetime_budget numeric(14, 2),
  -- { spend, impressions, reach, clicks, ctr, cpc, leads, cpl, conversations, costPerConversation, purchases, purchaseValue }
  insights jsonb not null default '{}'::jsonb,
  date_preset text not null default 'last_7d',
  -- Dark-post ids so ad comments can be matched back to their ad.
  story_id text,
  instagram_media_id text,
  creative_external_id text,
  captured_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint ad_campaign_snapshots_entity_key unique (ad_account_id, level, external_id),
  constraint ad_campaign_snapshots_level_check check (level in ('campaign', 'adset', 'ad'))
);

create index if not exists ad_campaign_snapshots_project_idx
  on campaign.ad_campaign_snapshots (project_id, level, captured_at desc)
  where deleted_at is null;
create index if not exists ad_campaign_snapshots_story_idx
  on campaign.ad_campaign_snapshots (project_id, story_id)
  where story_id is not null;

-- Automated rules evaluated by the ads worker (e.g. pause an ad set over a CPL threshold) --

create table if not exists campaign.ad_rules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- null = every connected account in the project.
  ad_account_id uuid references campaign.ad_accounts(id) on delete cascade,
  name text not null default 'Untitled rule',
  -- campaign | adset | ad
  level text not null default 'adset',
  -- cpl | cost_per_conversation | cpc | ctr | spend
  metric text not null default 'cpl',
  -- gt | lt
  operator text not null default 'gt',
  threshold numeric(14, 4) not null default 0,
  -- Only judge entities that spent at least this much in the window.
  min_spend numeric(14, 2) not null default 0,
  date_preset text not null default 'last_7d',
  -- pause | log
  action text not null default 'pause',
  -- active | paused
  status text not null default 'active',
  scope_ids text[] not null default '{}',
  last_evaluated_at timestamptz,
  last_triggered_at timestamptz,
  trigger_count integer not null default 0,
  -- [{ at, entityId, entityName, metric, value, action, result }] newest first, capped at 50.
  history jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint ad_rules_level_check check (level in ('campaign', 'adset', 'ad')),
  constraint ad_rules_operator_check check (operator in ('gt', 'lt'))
);

create index if not exists ad_rules_project_idx
  on campaign.ad_rules (project_id, created_at desc)
  where deleted_at is null;

-- Creative library: an asset plus copy variants --

create table if not exists campaign.ad_creatives (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- campaign.assets (Acquisition & Content); no FK across areas.
  asset_id uuid,
  name text not null default 'Untitled creative',
  -- image | video | carousel
  format text not null default 'image',
  media_url text not null default '',
  primary_text text not null default '',
  headline text not null default '',
  description text not null default '',
  -- Meta call_to_action type (LEARN_MORE, SHOP_NOW, SIGN_UP, WHATSAPP_MESSAGE, MESSAGE_PAGE, …)
  cta text not null default 'LEARN_MORE',
  link_url text not null default '',
  -- [{ id, label, primaryText, headline, description }]
  variants jsonb not null default '[]'::jsonb,
  -- draft | ready | archived
  status text not null default 'draft',
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists ad_creatives_project_idx
  on campaign.ad_creatives (project_id, created_at desc)
  where deleted_at is null;

-- Click-to-Message ads (WhatsApp / Messenger / Instagram Direct) and the flow that answers them --

create table if not exists campaign.ctwa_ads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  ad_account_id uuid references campaign.ad_accounts(id) on delete set null,
  name text not null default 'Untitled ad',
  -- whatsapp | messenger | instagram
  destination text not null default 'whatsapp',
  -- OUTCOME_ENGAGEMENT | OUTCOME_LEADS | OUTCOME_SALES
  objective text not null default 'OUTCOME_ENGAGEMENT',
  connection_id uuid references campaign.channel_connections(id) on delete set null,
  fb_page_id text,
  -- Chat automation flow / workflow that answers the thread (other areas' tables; no FK).
  flow_id uuid,
  automation_id uuid,
  -- Stable routing key carried in ice-breaker payloads and matched on referral.
  ref text not null,
  welcome_message text not null default '',
  -- [{ id, title, payload }]
  ice_breakers jsonb not null default '[]'::jsonb,
  creative_id uuid references campaign.ad_creatives(id) on delete set null,
  primary_text text not null default '',
  headline text not null default '',
  media_url text not null default '',
  daily_budget numeric(14, 2) not null default 10,
  currency text not null default 'USD',
  -- { countries: [], ageMin, ageMax }
  targeting jsonb not null default '{}'::jsonb,
  -- draft | publishing | paused | active | failed | archived
  status text not null default 'draft',
  external_campaign_id text,
  external_adset_id text,
  external_ad_id text,
  external_creative_id text,
  -- { conversationsStarted, spend, impressions, clicks, costPerConversation, threads, syncedAt }
  stats jsonb not null default '{}'::jsonb,
  last_error text,
  published_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint ctwa_ads_ref_key unique (project_id, ref),
  constraint ctwa_ads_destination_check check (destination in ('whatsapp', 'messenger', 'instagram'))
);

create index if not exists ctwa_ads_project_idx
  on campaign.ctwa_ads (project_id, created_at desc)
  where deleted_at is null;
create index if not exists ctwa_ads_external_ad_idx
  on campaign.ctwa_ads (external_ad_id)
  where external_ad_id is not null;

-- Lead Ads instant forms: question -> contact field mapping, consent and routing --

create table if not exists campaign.lead_forms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  ad_account_id uuid references campaign.ad_accounts(id) on delete set null,
  external_form_id text not null,
  fb_page_id text not null default '',
  page_name text not null default '',
  name text not null default 'Untitled form',
  -- Meta's form status: ACTIVE | ARCHIVED | DELETED | DRAFT
  form_status text not null default 'ACTIVE',
  locale text not null default '',
  -- [{ key, label, type, options }] as synced from Meta.
  questions jsonb not null default '[]'::jsonb,
  -- [{ key, text, required }] custom disclaimer checkboxes as synced.
  consent_checkboxes jsonb not null default '[]'::jsonb,
  -- { <question key>: email | phone | firstName | lastName | fullName | attributes.<key> | ignore }
  mapping jsonb not null default '{}'::jsonb,
  -- [{ source: "checkbox:<key>" | "question:<key>", channel }]
  consent_mapping jsonb not null default '[]'::jsonb,
  list_ids uuid[] not null default '{}',
  tags text[] not null default '{}',
  -- active (leads land as contacts) | paused
  status text not null default 'active',
  leads_count integer not null default 0,
  last_lead_at timestamptz,
  last_synced_at timestamptz,
  last_backfill_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint lead_forms_external_key unique (project_id, external_form_id)
);

create index if not exists lead_forms_project_idx
  on campaign.lead_forms (project_id, created_at desc)
  where deleted_at is null;

-- Custom Audience syncs: a segment hashed and uploaded to an ad account on a schedule --

create table if not exists campaign.audience_syncs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  segment_id uuid references campaign.segments(id) on delete set null,
  ad_account_id uuid references campaign.ad_accounts(id) on delete cascade,
  name text not null default 'Untitled audience',
  external_audience_id text,
  -- email | phone
  match_keys text[] not null default '{email}',
  -- manual | daily | weekly
  schedule text not null default 'daily',
  -- Dialling code applied to numbers stored without one (e.g. "351").
  default_country_code text not null default '',
  -- draft | queued | syncing | synced | failed | paused
  status text not null default 'draft',
  last_synced_at timestamptz,
  next_sync_at timestamptz,
  uploaded_count integer not null default 0,
  -- Meta's approximate_count_lower_bound after processing.
  matched_count integer,
  invalid_count integer not null default 0,
  last_error text,
  -- [{ at, uploaded, received, invalid, sessionId, batches }] newest first, capped at 20.
  runs jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists audience_syncs_project_idx
  on campaign.audience_syncs (project_id, created_at desc)
  where deleted_at is null;
create index if not exists audience_syncs_due_idx
  on campaign.audience_syncs (next_sync_at)
  where deleted_at is null and schedule <> 'manual';

-- Conversions API: dataset config, server-only token and the delivery log --

create table if not exists campaign.capi_configs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  ad_account_id uuid references campaign.ad_accounts(id) on delete set null,
  name text not null default 'Conversions API',
  -- Pixel / dataset id events are posted to.
  dataset_id text not null default '',
  -- [{ key, label, sources: [tracked event names], metaEvent, messagingEvent, valueFrom, enabled }]
  events jsonb not null default '[]'::jsonb,
  -- { currency }
  value_mapping jsonb not null default '{}'::jsonb,
  -- Days an ad referral in chat keeps attributing a contact's conversions to business_messaging.
  attribution_window_days integer not null default 7,
  -- { whatsappBusinessAccountId, pageId, igAccountId }
  messaging jsonb not null default '{}'::jsonb,
  test_event_code text not null default '',
  test_mode boolean not null default false,
  -- draft | active | paused | error
  status text not null default 'draft',
  -- Non-secret flag: capi_secrets holds a token for this config.
  token_set boolean not null default false,
  -- tracked_events scan cursor.
  cursor_at timestamptz,
  last_sent_at timestamptz,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists capi_configs_project_idx
  on campaign.capi_configs (project_id, created_at desc)
  where deleted_at is null;

create table if not exists campaign.capi_secrets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  capi_config_id uuid not null unique references campaign.capi_configs(id) on delete cascade,
  -- { accessToken }
  secrets jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists campaign.capi_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  capi_config_id uuid not null references campaign.capi_configs(id) on delete cascade,
  tracked_event_id uuid references campaign.tracked_events(id) on delete set null,
  contact_id uuid references campaign.contacts(id) on delete set null,
  event_name text not null,
  -- Deduplication key shared with the browser pixel's eventID.
  event_id text not null,
  -- website | business_messaging | system_generated | email | other
  action_source text not null default 'website',
  -- whatsapp | messenger | instagram (business_messaging only)
  messaging_channel text,
  -- queued | sent | failed | skipped
  status text not null default 'queued',
  is_test boolean not null default false,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  value numeric(14, 2),
  currency text,
  event_time timestamptz not null default now(),
  -- The event exactly as posted (user_data hashed).
  payload jsonb not null default '{}'::jsonb,
  response jsonb not null default '{}'::jsonb,
  error text,
  sent_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint capi_events_tracked_key unique (capi_config_id, tracked_event_id)
);

create index if not exists capi_events_project_idx
  on campaign.capi_events (project_id, created_at desc);
create index if not exists capi_events_queue_idx
  on campaign.capi_events (capi_config_id, next_attempt_at)
  where status = 'queued';

-- Ad comments: routing into the Comment Inbox and moderation scope --

create table if not exists campaign.ad_comment_rules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled rule',
  -- all_ads | campaigns | ads
  scope text not null default 'all_ads',
  -- External campaign or ad ids when scope isn't all_ads.
  scope_ids text[] not null default '{}',
  -- messenger (Facebook) | instagram
  channels text[] not null default '{messenger,instagram}',
  route_to_inbox boolean not null default true,
  assignee_id uuid,
  -- low | normal | high | urgent
  priority text not null default 'normal',
  tags text[] not null default '{}',
  hide_links boolean not null default false,
  hide_keywords text[] not null default '{}',
  -- Hide every comment on the scoped ads (comments off).
  hide_all boolean not null default false,
  -- active | paused
  status text not null default 'active',
  position integer not null default 0,
  matched_count integer not null default 0,
  hidden_count integer not null default 0,
  last_matched_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint ad_comment_rules_scope_check check (scope in ('all_ads', 'campaigns', 'ads'))
);

create index if not exists ad_comment_rules_project_idx
  on campaign.ad_comment_rules (project_id, position, created_at)
  where deleted_at is null;

-- Access ----------------------------------------------------------------------

select campaign.apply_standard_access('ad_accounts', 'campaign.ads.manage');
select campaign.apply_standard_access('ad_campaign_snapshots');
select campaign.apply_standard_access('ad_rules', 'campaign.ads.manage');
select campaign.apply_standard_access('ad_creatives', 'campaign.ads.manage');
select campaign.apply_standard_access('ctwa_ads', 'campaign.ads.manage');
select campaign.apply_standard_access('lead_forms', 'campaign.ads.manage');
select campaign.apply_standard_access('audience_syncs', 'campaign.ads.manage');
select campaign.apply_standard_access('capi_configs', 'campaign.ads.manage');
select campaign.apply_standard_access('capi_events');
select campaign.apply_standard_access('ad_comment_rules', 'campaign.ads.manage');

alter table campaign.ad_account_secrets enable row level security;
grant all on campaign.ad_account_secrets to service_role;
drop trigger if exists ad_account_secrets_touch_updated_at on campaign.ad_account_secrets;
create trigger ad_account_secrets_touch_updated_at
before update on campaign.ad_account_secrets
for each row execute function campaign.touch_updated_at();

alter table campaign.capi_secrets enable row level security;
grant all on campaign.capi_secrets to service_role;
drop trigger if exists capi_secrets_touch_updated_at on campaign.capi_secrets;
create trigger capi_secrets_touch_updated_at
before update on campaign.capi_secrets
for each row execute function campaign.touch_updated_at();

-- @down
drop table if exists campaign.ad_comment_rules cascade;
drop table if exists campaign.capi_events cascade;
drop table if exists campaign.capi_secrets cascade;
drop table if exists campaign.capi_configs cascade;
drop table if exists campaign.audience_syncs cascade;
drop table if exists campaign.lead_forms cascade;
drop table if exists campaign.ctwa_ads cascade;
drop table if exists campaign.ad_creatives cascade;
drop table if exists campaign.ad_rules cascade;
drop table if exists campaign.ad_campaign_snapshots cascade;
drop table if exists campaign.ad_account_secrets cascade;
drop table if exists campaign.ad_accounts cascade;
