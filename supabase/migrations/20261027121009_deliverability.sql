-- Deliverability
--
-- Sending-domain authentication, provider-assigned dedicated IPs, warm-up plans, seed-list inbox
-- placement tests, DNSBL history and email validation results. Owns:
--   tables     campaign.sending_domains, warmup_plans, dedicated_ips, placement_tests,
--              blocklist_checks, email_validations
--   functions  campaign.deliverability_daily_sends()
-- Writes need campaign.deliverability.manage; DNS checks run in server routes and the worker.

-- @up
create schema if not exists campaign;
grant usage on schema campaign to anon, authenticated, service_role;

-- Sending domains: one row per domain registered with the sending provider ---

create table if not exists campaign.sending_domains (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  domain text not null,
  -- Record templates live in lib/deliverability/records.js (resend = geiger-dash's provider).
  provider text not null default 'resend',
  region text not null default 'us-east-1',
  -- pending | verified | failing (was verified, a required record broke)
  status text not null default 'pending',
  -- [{ key, purpose, type, host, expected, priority, required, found: [], foundHost, status, message }]
  records jsonb not null default '[]'::jsonb,
  -- Per-mechanism analysis from the last check: { spf, dkim, dmarc, bimi, rootSpf, checkedAt }
  auth jsonb not null default '{}'::jsonb,
  -- { dkimKey, dmarcPolicy, dmarcRua, dmarcAlignment, bimiLogoUrl, bimiVmcUrl }
  settings jsonb not null default '{}'::jsonb,
  last_checked_at timestamptz,
  verified_at timestamptz,
  blocklist_checked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint sending_domains_status_check check (status in ('pending', 'verified', 'failing'))
);

create unique index if not exists sending_domains_project_domain_key
  on campaign.sending_domains (project_id, lower(domain))
  where deleted_at is null;
create index if not exists sending_domains_project_idx
  on campaign.sending_domains (project_id, created_at desc)
  where deleted_at is null;
create index if not exists sending_domains_due_idx
  on campaign.sending_domains (last_checked_at nulls first)
  where deleted_at is null;

-- Warm-up plans: a daily cap schedule for a new IP or messaging number ---

create table if not exists campaign.warmup_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default '',
  -- email | sms | whatsapp
  channel text not null default 'email',
  -- The number being warmed (sms / whatsapp); email plans name the IP instead.
  connection_id uuid references campaign.channel_connections(id) on delete set null,
  ip text,
  -- Curve key from lib/deliverability/warmup_curves.js
  curve text not null default 'standard',
  target_volume integer not null default 0,
  start_date date not null default current_date,
  -- [{ day, cap }] — day 1 is start_date
  schedule jsonb not null default '[]'::jsonb,
  -- active | paused | completed
  status text not null default 'active',
  paused_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint warmup_plans_channel_check check (channel in ('email', 'sms', 'whatsapp')),
  constraint warmup_plans_status_check check (status in ('active', 'paused', 'completed'))
);

create index if not exists warmup_plans_project_idx
  on campaign.warmup_plans (project_id, created_at desc)
  where deleted_at is null;
create index if not exists warmup_plans_active_idx
  on campaign.warmup_plans (project_id, channel)
  where deleted_at is null and status = 'active';

-- Dedicated IPs: provider-assigned sending IPs recorded for rDNS, blocklist and warm-up tracking ---

create table if not exists campaign.dedicated_ips (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  ip text not null,
  pool text not null default 'default',
  provider text not null default 'resend',
  -- active | warming | paused
  status text not null default 'warming',
  -- Hostname the provider configured for the IP (optional), and the PTR found at the last check.
  expected_rdns text,
  reverse_dns text,
  -- pending | pass | mismatch | missing | error
  rdns_status text not null default 'pending',
  rdns_checked_at timestamptz,
  blocklist_checked_at timestamptz,
  warmup_plan_id uuid references campaign.warmup_plans(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint dedicated_ips_status_check check (status in ('active', 'warming', 'paused')),
  constraint dedicated_ips_rdns_check check (rdns_status in ('pending', 'pass', 'mismatch', 'missing', 'error'))
);

create unique index if not exists dedicated_ips_project_ip_key
  on campaign.dedicated_ips (project_id, ip)
  where deleted_at is null;
create index if not exists dedicated_ips_project_idx
  on campaign.dedicated_ips (project_id, created_at desc)
  where deleted_at is null;

-- Placement tests: a test send to seed mailboxes the user controls, with per-mailbox results ---

create table if not exists campaign.placement_tests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled test',
  subject text not null default '',
  from_email text not null default '',
  -- custom | campaign
  content_source text not null default 'custom',
  campaign_id uuid references campaign.campaigns(id) on delete set null,
  html text not null default '',
  -- [{ email, provider }]
  seed_addresses jsonb not null default '[]'::jsonb,
  -- [{ email, provider, placement: pending|inbox|promotions|spam|missing, deliveryId, deliveryStatus, error, recordedAt }]
  results jsonb not null default '[]'::jsonb,
  -- Content pre-flight snapshot taken at send time (lib/deliverability/preflight.js)
  preflight jsonb not null default '{}'::jsonb,
  -- draft | sending | awaiting_results | completed | failed
  status text not null default 'draft',
  sent_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint placement_tests_status_check check (status in ('draft', 'sending', 'awaiting_results', 'completed', 'failed'))
);

create index if not exists placement_tests_project_idx
  on campaign.placement_tests (project_id, created_at desc)
  where deleted_at is null;

-- Blocklist checks: append-only DNSBL history, one row per (run, list, queried value) ---

create table if not exists campaign.blocklist_checks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  target text not null,
  -- ip | domain
  target_type text not null,
  -- The IP or domain actually queried: domain targets also check the IPs behind their A/MX records.
  checked_value text not null,
  -- DNSBL zone, e.g. zen.spamhaus.org
  list text not null,
  list_name text not null default '',
  -- clear | listed | error
  status text not null default 'clear',
  listed boolean not null default false,
  detail text not null default '',
  codes text[] not null default '{}',
  -- Groups the rows written by one check run.
  run_id uuid,
  sending_domain_id uuid references campaign.sending_domains(id) on delete cascade,
  dedicated_ip_id uuid references campaign.dedicated_ips(id) on delete cascade,
  checked_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint blocklist_checks_target_type_check check (target_type in ('ip', 'domain')),
  constraint blocklist_checks_status_check check (status in ('clear', 'listed', 'error'))
);

create index if not exists blocklist_checks_project_idx
  on campaign.blocklist_checks (project_id, checked_at desc)
  where deleted_at is null;
create index if not exists blocklist_checks_target_idx
  on campaign.blocklist_checks (project_id, target, checked_at desc)
  where deleted_at is null;

-- Email validations: latest result per address (re-validating upserts the row) ---

create table if not exists campaign.email_validations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- Stored lowercased.
  email text not null,
  domain text not null default '',
  -- valid | invalid | risky | unknown
  result text not null default 'unknown',
  -- Reason codes from lib/deliverability/email_check.js (syntax, no_mx, disposable, role_account, typo…)
  reasons text[] not null default '{}',
  suggestion text,
  -- [{ exchange, priority }]
  mx jsonb not null default '[]'::jsonb,
  checked_at timestamptz not null default now(),
  contact_id uuid references campaign.contacts(id) on delete set null,
  -- manual | contacts | api
  source text not null default 'manual',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint email_validations_project_email_key unique (project_id, email),
  constraint email_validations_result_check check (result in ('valid', 'invalid', 'risky', 'unknown'))
);

create index if not exists email_validations_project_idx
  on campaign.email_validations (project_id, checked_at desc)
  where deleted_at is null;
create index if not exists email_validations_contact_idx
  on campaign.email_validations (contact_id)
  where contact_id is not null;

-- Per-day send counts for warm-up progress. Security invoker, so deliveries' member-read RLS applies.
create or replace function campaign.deliverability_daily_sends(
  p_project uuid,
  p_channel text,
  p_since timestamptz,
  p_connection uuid default null
)
returns table (day date, sent bigint)
language sql
stable
security invoker
set search_path = campaign
as $$
  select (d.created_at at time zone 'utc')::date as day, count(*)::bigint as sent
  from campaign.deliveries d
  where d.project_id = p_project
    and d.channel = p_channel
    and d.created_at >= p_since
    and d.deleted_at is null
    and d.status not in ('failed', 'not_sent')
    and (p_connection is null or d.connection_id = p_connection)
  group by 1
  order by 1;
$$;

grant execute on function campaign.deliverability_daily_sends(uuid, text, timestamptz, uuid) to authenticated, service_role;

-- Access ----------------------------------------------------------------------

select campaign.apply_standard_access('sending_domains', 'campaign.deliverability.manage');
select campaign.apply_standard_access('warmup_plans', 'campaign.deliverability.manage');
select campaign.apply_standard_access('dedicated_ips', 'campaign.deliverability.manage');
select campaign.apply_standard_access('placement_tests', 'campaign.deliverability.manage');
select campaign.apply_standard_access('blocklist_checks', 'campaign.deliverability.manage');
select campaign.apply_standard_access('email_validations', 'campaign.deliverability.manage');

-- @down
drop function if exists campaign.deliverability_daily_sends(uuid, text, timestamptz, uuid);
drop table if exists campaign.email_validations cascade;
drop table if exists campaign.blocklist_checks cascade;
drop table if exists campaign.placement_tests cascade;
drop table if exists campaign.dedicated_ips cascade;
drop table if exists campaign.warmup_plans cascade;
drop table if exists campaign.sending_domains cascade;
