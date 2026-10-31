-- Acquisition & content
--
-- Owns:
--   tables     campaign.forms, form_submissions, landing_pages, popups, surveys, survey_responses,
--              tracking_links, assets, brand_kits
--   functions  campaign.acquisition_bump()
--   storage    "Products campaign *" policies on storage.objects for products/campaign/<project-uuid>/…
-- Workspace screens write through RLS (acquisition.edit / content.edit / settings.manage); public
-- pages, submissions, views and clicks are server-written with the service role.

-- @up
create extension if not exists pgcrypto;

create schema if not exists campaign;
grant usage on schema campaign to anon, authenticated, service_role;

-- Depends on the core platform migration (contacts, campaigns, apply_standard_access, rbac helpers).

-- Forms ---------------------------------------------------------------------

create table if not exists campaign.forms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled form',
  description text not null default '',
  -- embedded | popup | hosted: where the form is mainly used (display only; every form works everywhere)
  kind text not null default 'embedded',
  -- draft | live | paused; only live forms accept submissions
  status text not null default 'draft',
  -- [{ id, type, key, label, placeholder, helpText, required, options, channel, defaultValue }]
  fields jsonb not null default '[]'::jsonb,
  -- { listIds, tags, doubleOptIn, consentText, consentChannels, redirectUrl, successMessage, submitLabel }
  settings jsonb not null default '{}'::jsonb,
  submission_count integer not null default 0,
  view_count integer not null default 0,
  last_submission_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint forms_status_check check (status in ('draft', 'live', 'paused'))
);

create index if not exists forms_project_idx
  on campaign.forms (project_id, created_at desc)
  where deleted_at is null;

-- Landing pages -------------------------------------------------------------

create table if not exists campaign.landing_pages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled page',
  slug text not null,
  template text not null default 'blank',
  -- [{ id, type: hero | text | image | form | features | cta, props }]
  blocks jsonb not null default '[]'::jsonb,
  -- { title, description, imageUrl, noIndex }
  seo jsonb not null default '{}'::jsonb,
  -- draft | published | archived; only published pages answer at /p/<slug>
  status text not null default 'draft',
  form_id uuid references campaign.forms(id) on delete set null,
  published_at timestamptz,
  views integer not null default 0,
  conversions integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint landing_pages_status_check check (status in ('draft', 'published', 'archived'))
);

create index if not exists landing_pages_project_idx
  on campaign.landing_pages (project_id, created_at desc)
  where deleted_at is null;
create unique index if not exists landing_pages_project_slug_key
  on campaign.landing_pages (project_id, lower(slug))
  where deleted_at is null;
-- /p/<slug> has no project in it, so a live slug is unique across the deployment.
create unique index if not exists landing_pages_live_slug_key
  on campaign.landing_pages (lower(slug))
  where status = 'published' and deleted_at is null;

-- Popups --------------------------------------------------------------------

create table if not exists campaign.popups (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled popup',
  form_id uuid references campaign.forms(id) on delete set null,
  -- draft | active | paused; only active popups are served to the embed script
  status text not null default 'draft',
  -- { type: exit_intent | scroll | delay | click, value }
  trigger jsonb not null default '{}'::jsonb,
  -- { urls: { mode, patterns }, devices, frequency: { type, days } }
  targeting jsonb not null default '{}'::jsonb,
  -- { layout, position, headline, body, imageUrl, showClose }
  design jsonb not null default '{}'::jsonb,
  impressions integer not null default 0,
  conversions integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint popups_status_check check (status in ('draft', 'active', 'paused'))
);

create index if not exists popups_project_idx
  on campaign.popups (project_id, created_at desc)
  where deleted_at is null;

-- Form submissions: one row per accepted submission (server-written) --------

create table if not exists campaign.form_submissions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  form_id uuid not null references campaign.forms(id) on delete cascade,
  contact_id uuid references campaign.contacts(id) on delete set null,
  landing_page_id uuid references campaign.landing_pages(id) on delete set null,
  popup_id uuid references campaign.popups(id) on delete set null,
  -- received | pending_confirmation | confirmed
  status text not null default 'received',
  data jsonb not null default '{}'::jsonb,
  -- { email: true, sms: false, … } as captured on this submission
  consent jsonb not null default '{}'::jsonb,
  source_url text,
  referrer text,
  utm jsonb not null default '{}'::jsonb,
  ip text,
  user_agent text,
  confirmed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists form_submissions_form_idx
  on campaign.form_submissions (form_id, created_at desc);
create index if not exists form_submissions_project_idx
  on campaign.form_submissions (project_id, created_at desc)
  where deleted_at is null;
create index if not exists form_submissions_ip_idx
  on campaign.form_submissions (ip, created_at desc)
  where ip is not null;

-- Surveys -------------------------------------------------------------------

create table if not exists campaign.surveys (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled survey',
  description text not null default '',
  -- draft | live | closed; only live surveys accept responses
  status text not null default 'draft',
  -- [{ id, type: nps | rating | single | multiple | text, label, required, options, scale, long }]
  questions jsonb not null default '[]'::jsonb,
  -- { kind: nps | csat | poll | feedback, intro, thankYouMessage, submitLabel }
  settings jsonb not null default '{}'::jsonb,
  response_count integer not null default 0,
  last_response_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint surveys_status_check check (status in ('draft', 'live', 'closed'))
);

create index if not exists surveys_project_idx
  on campaign.surveys (project_id, created_at desc)
  where deleted_at is null;

create table if not exists campaign.survey_responses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  survey_id uuid not null references campaign.surveys(id) on delete cascade,
  contact_id uuid references campaign.contacts(id) on delete set null,
  -- { <question id>: number | string | string[] }
  answers jsonb not null default '{}'::jsonb,
  source_url text,
  utm jsonb not null default '{}'::jsonb,
  ip text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists survey_responses_survey_idx
  on campaign.survey_responses (survey_id, created_at desc);
create index if not exists survey_responses_project_idx
  on campaign.survey_responses (project_id, created_at desc)
  where deleted_at is null;

-- Tracking links: UTM-tagged short links answered at /l/<slug> --------------

create table if not exists campaign.tracking_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default '',
  slug text not null,
  destination_url text not null,
  -- { source, medium, campaign, term, content }
  utm jsonb not null default '{}'::jsonb,
  campaign_id uuid references campaign.campaigns(id) on delete set null,
  clicks integer not null default 0,
  last_clicked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists tracking_links_project_idx
  on campaign.tracking_links (project_id, created_at desc)
  where deleted_at is null;
-- /l/<slug> has no project in it, so a slug is unique across the deployment.
create unique index if not exists tracking_links_slug_key
  on campaign.tracking_links (slug)
  where deleted_at is null;

-- Assets: every uploaded file (Storage bucket "products", campaign/<project-uuid>/…) --

create table if not exists campaign.assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled asset',
  -- image | video | document | other
  kind text not null default 'other',
  url text not null default '',
  storage_path text,
  size bigint not null default 0,
  width integer,
  height integer,
  mime text not null default '',
  alt_text text not null default '',
  tags text[] not null default '{}',
  folder text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint assets_kind_check check (kind in ('image', 'video', 'document', 'other'))
);

create index if not exists assets_project_idx
  on campaign.assets (project_id, created_at desc)
  where deleted_at is null;
create index if not exists assets_kind_idx
  on campaign.assets (project_id, kind)
  where deleted_at is null;
create index if not exists assets_tags_idx on campaign.assets using gin (tags);

-- Brand kit: one row per project, read by hosted pages, email footers and AI copy --

create table if not exists campaign.brand_kits (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Brand kit',
  logo_url text not null default '',
  logo_dark_url text not null default '',
  icon_url text not null default '',
  primary_color text not null default '',
  accent_color text not null default '',
  text_color text not null default '',
  background_color text not null default '',
  font_heading text not null default '',
  font_body text not null default '',
  voice text not null default '',
  footer_text text not null default '',
  company_address text not null default '',
  -- { website, instagram, facebook, x, linkedin, tiktok, youtube }
  social_links jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint brand_kits_project_key unique (project_id)
);

-- Counters ------------------------------------------------------------------

-- Atomic counter bump for server-side ingest (views, submissions, clicks); service role only.
create or replace function campaign.acquisition_bump(p_table text, p_id uuid, p_column text, p_by integer default 1)
returns void
language plpgsql
security definer
set search_path = campaign
as $$
begin
  if p_table not in ('forms', 'landing_pages', 'popups', 'surveys', 'tracking_links') then
    raise exception 'acquisition_bump: table % is not allowed', p_table;
  end if;
  if p_column not in ('submission_count', 'view_count', 'views', 'conversions', 'impressions', 'response_count', 'clicks') then
    raise exception 'acquisition_bump: column % is not allowed', p_column;
  end if;
  execute format(
    'update campaign.%I set %I = coalesce(%I, 0) + $1 where id = $2 and deleted_at is null',
    p_table, p_column, p_column
  )
  using coalesce(p_by, 1), p_id;
end;
$$;

revoke all on function campaign.acquisition_bump(text, uuid, text, integer) from public, anon, authenticated;
grant execute on function campaign.acquisition_bump(text, uuid, text, integer) to service_role;

-- Access ----------------------------------------------------------------------

select campaign.apply_standard_access('forms', 'campaign.acquisition.edit');
select campaign.apply_standard_access('landing_pages', 'campaign.acquisition.edit');
select campaign.apply_standard_access('popups', 'campaign.acquisition.edit');
select campaign.apply_standard_access('surveys', 'campaign.acquisition.edit');
select campaign.apply_standard_access('tracking_links', 'campaign.acquisition.edit');
select campaign.apply_standard_access('form_submissions');
select campaign.apply_standard_access('survey_responses');
select campaign.apply_standard_access('assets', 'campaign.content.edit');
select campaign.apply_standard_access('brand_kits', 'campaign.content.edit');

-- The brand kit is edited from Content -> Brand kit and Settings -> Branding, so either key may write it.
drop policy if exists brand_kits_write on campaign.brand_kits;
create policy brand_kits_write on campaign.brand_kits
  for all to authenticated
  using (
    campaign.rbac_allows('campaign.content.edit', project_id)
    or campaign.rbac_allows('campaign.settings.manage', project_id)
  )
  with check (
    campaign.rbac_allows('campaign.content.edit', project_id)
    or campaign.rbac_allows('campaign.settings.manage', project_id)
  );

-- Storage: products/campaign/<project-uuid>/… ---------------------------------

insert into storage.buckets (id, name, public)
values ('products', 'products', true)
on conflict (id) do nothing;

drop policy if exists "Products campaign public read" on storage.objects;
drop policy if exists "Products campaign member insert" on storage.objects;
drop policy if exists "Products campaign owner update" on storage.objects;
drop policy if exists "Products campaign owner delete" on storage.objects;

-- Anyone may read (hosted pages and emails embed the public URL).
create policy "Products campaign public read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'products' and (storage.foldername(name))[1] = 'campaign');

-- Members of the project in the second path segment may upload into it.
create policy "Products campaign member insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'products'
    and (storage.foldername(name))[1] = 'campaign'
    and exists (
      select 1 from public.projects p
      where p.id::text = (storage.foldername(storage.objects.name))[2]
        and campaign.rbac_is_member(p.id)
    )
  );

-- Only the uploader may replace or remove an object.
create policy "Products campaign owner update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'products'
    and (storage.foldername(name))[1] = 'campaign'
    and owner_id = (select auth.uid())::text
  )
  with check (
    bucket_id = 'products'
    and (storage.foldername(name))[1] = 'campaign'
    and owner_id = (select auth.uid())::text
  );

create policy "Products campaign owner delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'products'
    and (storage.foldername(name))[1] = 'campaign'
    and owner_id = (select auth.uid())::text
  );

-- @down
drop policy if exists "Products campaign owner delete" on storage.objects;
drop policy if exists "Products campaign owner update" on storage.objects;
drop policy if exists "Products campaign member insert" on storage.objects;
drop policy if exists "Products campaign public read" on storage.objects;
drop function if exists campaign.acquisition_bump(text, uuid, text, integer);
drop table if exists campaign.brand_kits cascade;
drop table if exists campaign.assets cascade;
drop table if exists campaign.tracking_links cascade;
drop table if exists campaign.survey_responses cascade;
drop table if exists campaign.surveys cascade;
drop table if exists campaign.form_submissions cascade;
drop table if exists campaign.popups cascade;
drop table if exists campaign.landing_pages cascade;
drop table if exists campaign.forms cascade;
