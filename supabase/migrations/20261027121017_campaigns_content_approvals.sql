-- Campaigns content and approvals
--
-- Owns campaign.email_templates (saved builder documents), campaign.content_blocks (reusable saved
-- blocks), campaign.approval_policies (one sign-off policy per project) and campaign.approval_requests
-- (one row per "submit for review", decided by approvers). Read by lib/campaigns/approvals.js, which the
-- send routes call before sending or scheduling.

-- @up
create extension if not exists pgcrypto;
create schema if not exists campaign;
grant usage on schema campaign to anon, authenticated, service_role;

-- Email templates -----------------------------------------------------------

create table if not exists campaign.email_templates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled template',
  -- newsletter | promotion | announcement | event | welcome | ecommerce
  category text not null default 'newsletter',
  subject text not null default '',
  preheader text not null default '',
  -- Builder document: { blocks: [{ id, type, props, visibleIf }], settings: {...} } (lib/email/blocks.js)
  content jsonb not null default '{}'::jsonb,
  -- Rendered HTML snapshot taken on save, used for thumbnails and previews.
  preview_html text,
  thumbnail_url text not null default '',
  is_starter boolean not null default false,
  starter_key text,
  usage_count integer not null default 0,
  last_used_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists email_templates_project_idx
  on campaign.email_templates (project_id, created_at desc)
  where deleted_at is null;

select campaign.apply_standard_access('email_templates', 'campaign.content.edit');

-- Content blocks ------------------------------------------------------------

create table if not exists campaign.content_blocks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled block',
  description text not null default '',
  -- The builder block type (heading | text | image | button | columns | product | social | html …).
  block_type text not null default 'text',
  -- One builder block: { id, type, props, visibleIf }.
  block jsonb not null default '{}'::jsonb,
  usage_count integer not null default 0,
  last_used_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists content_blocks_project_idx
  on campaign.content_blocks (project_id, created_at desc)
  where deleted_at is null;

select campaign.apply_standard_access('content_blocks', 'campaign.content.edit');

-- Approval policy: one row per project --------------------------------------

create table if not exists campaign.approval_policies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  required boolean not null default false,
  -- Role keys allowed to decide (empty = anyone holding campaign.approval.decide).
  approver_roles text[] not null default '{}',
  -- Specific people allowed to decide (empty = no per-person restriction).
  approver_ids uuid[] not null default '{}',
  min_approvals integer not null default 1,
  -- Channels the policy covers (empty = every channel).
  channels text[] not null default '{}',
  allow_self_approval boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint approval_policies_project_key unique (project_id),
  constraint approval_policies_min_check check (min_approvals between 1 and 5)
);

select campaign.apply_standard_access('approval_policies', 'campaign.settings.manage');

-- Approval requests ---------------------------------------------------------

create table if not exists campaign.approval_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  campaign_id uuid not null references campaign.campaigns(id) on delete cascade,
  -- pending | approved | rejected | changes_requested | withdrawn
  status text not null default 'pending',
  requested_by uuid,
  decided_by uuid,
  decided_at timestamptz,
  -- The requester's note to reviewers.
  note text not null default '',
  -- The latest reviewer note shared with the requester.
  decision_note text not null default '',
  -- Every decision on the request: [{ userId, decision, note, at }].
  decisions jsonb not null default '[]'::jsonb,
  -- Hash of the reviewed content (lib/campaigns/fingerprint.js); an edit after approval invalidates it.
  fingerprint text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint approval_requests_status_check check (
    status in ('pending', 'approved', 'rejected', 'changes_requested', 'withdrawn')
  )
);

create index if not exists approval_requests_project_idx
  on campaign.approval_requests (project_id, created_at desc)
  where deleted_at is null;
create index if not exists approval_requests_campaign_idx
  on campaign.approval_requests (campaign_id, created_at desc)
  where deleted_at is null;

-- Deciding needs campaign.approval.decide; editors may only submit new pending requests.
select campaign.apply_standard_access('approval_requests', 'campaign.approval.decide');

drop policy if exists approval_requests_submit on campaign.approval_requests;
create policy approval_requests_submit on campaign.approval_requests
  for insert to authenticated
  with check (status = 'pending' and campaign.rbac_allows('campaign.campaign.edit', project_id));

-- @down
drop policy if exists approval_requests_submit on campaign.approval_requests;
drop table if exists campaign.approval_requests cascade;
drop table if exists campaign.approval_policies cascade;
drop table if exists campaign.content_blocks cascade;
drop table if exists campaign.email_templates cascade;
