-- RBAC team access for Geiger Campaign
--
-- Makes campaign.role_grants the real gate behind the sidebar and the Team & Roles screen.
--
-- Context: 20260826090307_adopt_rbac was pushed but its file never reached the repo (status shows "no file"). It created
-- campaign.role_grants, campaign.rbac_allows and campaign.rbac_ensure_membership. This file re-declares that storage
-- idempotently so a fresh database still builds, and takes ownership of everything below.
--
-- Owns:
--   campaign.rbac_role_for_member(uuid, uuid)   suite org role -> campaign role id (same mapping as events/assets)
--   campaign.rbac_ensure_membership(uuid, uuid) redefined: SECURITY DEFINER, grants the mapped role, never revives a revoke
--   campaign.rbac_list_members(uuid)            roster: grants + identity from auth.users
--   campaign.rbac_org_candidates(uuid)          org members holding no grant yet (the "add member" picker)
--   campaign.role_grants policies               reads: own grants or team admins; writes: campaign.team.assign/invite holders
--
-- Org role mapping (public.organization_users.role, lower-cased): owner -> owner, admin -> admin, manager -> manager,
-- any other -> member, not in the org -> nothing. A project's creator with no org role is its owner.
--
-- public.roles keeps its suite-wide open write policy: tightening a shared table is a suite decision, not this product's.

-- @up
create extension if not exists pgcrypto;
create schema if not exists campaign;
grant usage on schema campaign to anon, authenticated, service_role;

-- Shared objects (normally created by whichever product adopted @geiger/rbac first). Bodies match @geiger/rbac.
create or replace function public.rbac_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.rbac_key_matches(p_patterns text[], p_key text)
returns boolean
language sql
immutable
as $$
  select exists (
    select 1
    from unnest(coalesce(p_patterns, '{}'::text[])) as pat
    where pat = '*'
       or pat = p_key
       or (
         right(pat, 2) = '.*'
         and left(p_key, length(pat) - 1) = left(pat, length(pat) - 1)
       )
  );
$$;

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  key text,
  name text not null default 'Untitled role',
  description text not null default '',
  color text not null default 'slate',
  permissions text[] not null default '{}',
  is_system boolean not null default false,
  sort integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists roles_project_idx
  on public.roles (project_id) where deleted_at is null;
create unique index if not exists roles_project_key_uniq
  on public.roles (project_id, key) where key is not null and deleted_at is null;

alter table public.roles enable row level security;

-- Only create the shared policies when missing, so this product never rewrites another product's definitions.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'roles' and policyname = 'roles_read') then
    create policy roles_read on public.roles for select to anon, authenticated using (deleted_at is null);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'roles' and policyname = 'roles_write') then
    create policy roles_write on public.roles for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'roles_touch_updated_at' and tgrelid = 'public.roles'::regclass) then
    create trigger roles_touch_updated_at before update on public.roles
      for each row execute function public.rbac_touch_updated_at();
  end if;
end;
$$;

-- This product's assignments: one row per (user, role) in a project; scope narrows it, {} = whole project.
create table if not exists campaign.role_grants (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid not null,
  role_id uuid not null references public.roles(id) on delete cascade,
  scope jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  granted_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists campaign_role_grants_lookup_idx
  on campaign.role_grants (user_id, project_id) where deleted_at is null;
create index if not exists campaign_role_grants_role_idx
  on campaign.role_grants (role_id) where deleted_at is null;
create unique index if not exists campaign_role_grants_uniq
  on campaign.role_grants (project_id, user_id, role_id) where deleted_at is null;

drop trigger if exists role_grants_touch_updated_at on campaign.role_grants;
create trigger role_grants_touch_updated_at
before update on campaign.role_grants
for each row execute function public.rbac_touch_updated_at();

-- The predicate gated policies call. SECURITY DEFINER so grants authorize without being selectable; STABLE so it caches.
create or replace function campaign.rbac_allows(
  p_permission text,
  p_project uuid default null,
  p_scope_type text default null,
  p_scope_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public, campaign
as $$
  select exists (
    select 1
    from campaign.role_grants g
    join public.roles r on r.id = g.role_id
    where g.user_id = auth.uid()
      and g.status = 'active'
      and g.deleted_at is null
      and r.deleted_at is null
      and (p_project is null or g.project_id = p_project)
      and public.rbac_key_matches(r.permissions, p_permission)
      and (
        p_scope_type is null
        or not jsonb_exists(g.scope, p_scope_type)
        or (
          p_scope_id is not null
          and jsonb_exists(g.scope -> p_scope_type, p_scope_id::text)
        )
      )
  );
$$;

grant execute on function campaign.rbac_allows(text, uuid, text, uuid) to anon, authenticated;
grant execute on function public.rbac_key_matches(text[], text) to anon, authenticated;

-- The campaign role a person should hold in a project, from their suite org role; null when they cannot reach it.
create or replace function campaign.rbac_role_for_member(p_project_id uuid, p_user uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public, campaign
as $$
declare
  v_org uuid;
  v_creator uuid;
  v_org_role text;
  v_key text;
  v_role uuid;
begin
  if p_project_id is null or p_user is null then
    return null;
  end if;

  select organization_id, created_by into v_org, v_creator
    from public.projects
   where id = p_project_id and deleted_at is null;

  if v_org is not null then
    select lower(ou.role::text) into v_org_role
      from public.organization_users ou
     where ou."organization" = v_org and ou."user" = p_user
     limit 1;
  end if;

  v_key := case
    when v_org_role = 'owner' then 'owner'
    when v_org_role = 'admin' then 'admin'
    when v_org_role = 'manager' then 'manager'
    when v_org_role is not null then 'member'
    else null
  end;

  if v_key is null and v_creator = p_user then
    v_key := 'owner';
  end if;

  if v_key is null then
    return null;
  end if;

  select r.id into v_role
    from public.roles r
   where r.project_id = p_project_id and r.key = v_key and r.deleted_at is null
   limit 1;

  -- The mapped role may not be seeded yet: fall back to member, then to nothing.
  if v_role is null and v_key <> 'member' then
    select r.id into v_role
      from public.roles r
     where r.project_id = p_project_id and r.key = 'member' and r.deleted_at is null
     limit 1;
  end if;

  return v_role;
end;
$$;

grant execute on function campaign.rbac_role_for_member(uuid, uuid) to authenticated;

-- The caller's own grant bootstrap. p_default_role is kept for signature compatibility and is no longer used:
-- the role comes from the org mapping, so a caller cannot pick their own.
create or replace function campaign.rbac_ensure_membership(
  p_project_id uuid,
  p_default_role uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, campaign
as $$
declare
  v_uid uuid := auth.uid();
  v_role uuid;
  v_existing uuid;
  v_ever integer;
begin
  if p_project_id is null or v_uid is null then
    return null;
  end if;

  select role_id into v_existing
    from campaign.role_grants
   where project_id = p_project_id and user_id = v_uid
     and deleted_at is null and status = 'active'
   limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  -- A revoked grant is a decision, not a gap. Never hand one back.
  select count(*) into v_ever
    from campaign.role_grants
   where project_id = p_project_id and user_id = v_uid;

  if v_ever > 0 then
    return null;
  end if;

  v_role := campaign.rbac_role_for_member(p_project_id, v_uid);
  if v_role is null then
    return null;
  end if;

  insert into campaign.role_grants (project_id, user_id, role_id, status)
  values (p_project_id, v_uid, v_role, 'active')
  on conflict do nothing;

  return v_role;
end;
$$;

grant execute on function campaign.rbac_ensure_membership(uuid, uuid) to authenticated;

-- Roster for the Team screen. Only an active member of the project may read it.
create or replace function campaign.rbac_list_members(p_project_id uuid)
returns table (
  user_id uuid,
  email text,
  name text,
  avatar_url text,
  role_id uuid,
  role_key text,
  role_name text,
  status text,
  granted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, campaign, auth
as $$
begin
  if p_project_id is null or auth.uid() is null then
    return;
  end if;

  if not exists (
    select 1 from campaign.role_grants g
     where g.project_id = p_project_id and g.user_id = auth.uid()
       and g.status = 'active' and g.deleted_at is null
  ) then
    return;
  end if;

  return query
  select
    g.user_id,
    coalesce(u.email, '')::text,
    coalesce(
      nullif(u.raw_user_meta_data ->> 'full_name', ''),
      nullif(u.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(u.email, ''), '@', 1)
    )::text,
    nullif(u.raw_user_meta_data ->> 'avatar_url', '')::text,
    g.role_id,
    r.key::text,
    r.name::text,
    g.status::text,
    g.created_at
  from campaign.role_grants g
  join public.roles r on r.id = g.role_id
  left join auth.users u on u.id = g.user_id
  where g.project_id = p_project_id and g.deleted_at is null
  order by r.sort, coalesce(u.email, '');
end;
$$;

grant execute on function campaign.rbac_list_members(uuid) to authenticated;

-- Org members who hold no grant in this project yet. Only an active member may ask.
create or replace function campaign.rbac_org_candidates(p_project_id uuid)
returns table (
  user_id uuid,
  email text,
  name text,
  avatar_url text,
  org_role text
)
language plpgsql
stable
security definer
set search_path = public, campaign, auth
as $$
begin
  if p_project_id is null or auth.uid() is null then
    return;
  end if;

  if not exists (
    select 1 from campaign.role_grants g
     where g.project_id = p_project_id and g.user_id = auth.uid()
       and g.status = 'active' and g.deleted_at is null
  ) then
    return;
  end if;

  return query
  select
    u.id,
    coalesce(u.email, '')::text,
    coalesce(
      nullif(u.raw_user_meta_data ->> 'full_name', ''),
      nullif(u.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(u.email, ''), '@', 1)
    )::text,
    nullif(u.raw_user_meta_data ->> 'avatar_url', '')::text,
    ou.role::text
  from public.projects p
  join public.organization_users ou on ou."organization" = p.organization_id
  join auth.users u on u.id = ou."user"
  where p.id = p_project_id
    and not exists (
      select 1 from campaign.role_grants g
       where g.project_id = p_project_id and g.user_id = u.id and g.deleted_at is null
    )
  order by coalesce(u.email, '');
end;
$$;

grant execute on function campaign.rbac_org_candidates(uuid) to authenticated;

-- Grants: read your own, or everyone's if you administer the team; write only with team.assign / team.invite.
-- 20260826090307 never granted table privileges, so the browser could not reach this table at all. No delete: soft delete only.
grant select, insert, update on campaign.role_grants to authenticated;
grant all on campaign.role_grants to service_role;

alter table campaign.role_grants enable row level security;

drop policy if exists role_grants_read on campaign.role_grants;
create policy role_grants_read on campaign.role_grants
  for select to authenticated
  using (
    deleted_at is null
    and (
      user_id = auth.uid()
      or campaign.rbac_allows('campaign.team.assign', project_id)
      or campaign.rbac_allows('campaign.team.invite', project_id)
    )
  );

-- Revoked rows stay readable to team admins so grantRole() can revive them instead of tripping the unique index.
drop policy if exists role_grants_admin_read on campaign.role_grants;
create policy role_grants_admin_read on campaign.role_grants
  for select to authenticated
  using (
    campaign.rbac_allows('campaign.team.assign', project_id)
    or campaign.rbac_allows('campaign.team.invite', project_id)
  );

drop policy if exists role_grants_write on campaign.role_grants;
create policy role_grants_write on campaign.role_grants
  for all to authenticated
  using (
    campaign.rbac_allows('campaign.team.assign', project_id)
    or campaign.rbac_allows('campaign.team.invite', project_id)
  )
  with check (
    campaign.rbac_allows('campaign.team.assign', project_id)
    or campaign.rbac_allows('campaign.team.invite', project_id)
  );

-- @down
drop policy if exists role_grants_admin_read on campaign.role_grants;
revoke select, insert, update on campaign.role_grants from authenticated;
revoke all on campaign.role_grants from service_role;

-- Restore the demo-open policies 20260826090307_adopt_rbac shipped.
drop policy if exists role_grants_read on campaign.role_grants;
create policy role_grants_read on campaign.role_grants
  for select to anon, authenticated using (deleted_at is null);

drop policy if exists role_grants_write on campaign.role_grants;
create policy role_grants_write on campaign.role_grants
  for all to authenticated using (true) with check (true);

drop function if exists campaign.rbac_org_candidates(uuid);
drop function if exists campaign.rbac_list_members(uuid);

-- Restore 20260826090307's body (creator or first-in -> owner, else p_default_role / member).
create or replace function campaign.rbac_ensure_membership(
  p_project_id uuid,
  p_default_role uuid default null
)
returns uuid
language plpgsql
set search_path = public, campaign
as $$
declare
  v_uid uuid := auth.uid();
  v_creator uuid;
  v_role uuid;
  v_existing uuid;
  v_ever integer;
begin
  if p_project_id is null or v_uid is null then
    return null;
  end if;

  select created_by into v_creator
    from public.projects
   where id = p_project_id
     and deleted_at is null;
  if v_creator is null then
    return null;
  end if;

  select role_id into v_existing
    from campaign.role_grants
   where project_id = p_project_id and user_id = v_uid
     and deleted_at is null and status = 'active'
   limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  select count(*) into v_ever
    from campaign.role_grants
   where project_id = p_project_id and user_id = v_uid;

  if v_ever > 0 then
    return null;
  end if;

  select count(*) into v_ever
    from campaign.role_grants
   where project_id = p_project_id and deleted_at is null and status = 'active';

  if v_creator = v_uid or v_ever = 0 then
    select r.id into v_role from public.roles r
     where r.project_id = p_project_id and r.key = 'owner' and r.deleted_at is null
     limit 1;
  end if;

  if v_role is null then
    select coalesce(
             p_default_role,
             (select r.id from public.roles r
               where r.project_id = p_project_id and r.key = 'member' and r.deleted_at is null
               limit 1)
           )
      into v_role;
  end if;

  if v_role is null then
    return null;
  end if;

  insert into campaign.role_grants (project_id, user_id, role_id, status)
  values (p_project_id, v_uid, v_role, 'active')
  on conflict do nothing;

  return v_role;
end;
$$;

drop function if exists campaign.rbac_role_for_member(uuid, uuid);

-- campaign.role_grants and campaign.rbac_allows belong to 20260826090307_adopt_rbac and are left in place.
