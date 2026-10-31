-- Commerce
--
-- Connected storefronts and the shopper behaviour they stream in. Owns:
--   tables     campaign.stores, store_secrets, products, carts, orders, coupons, coupon_codes,
--              recommendation_rules
--   functions  campaign.commerce_redeem_coupon()
-- Stores push webhooks to /api/public/commerce/<storeId>/events (HMAC-verified with store_secrets,
-- service role); members read everything, writes need campaign.commerce.edit.

-- @up
create extension if not exists pgcrypto;

create schema if not exists campaign;
grant usage on schema campaign to anon, authenticated, service_role;

-- Stores ----------------------------------------------------------------------

create table if not exists campaign.stores (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled store',
  -- shopify | woocommerce | custom
  platform text not null default 'custom',
  domain text not null default '',
  currency text not null default 'USD',
  -- pending (no events yet) | connected | error
  status text not null default 'pending',
  -- An active cart with no activity for this long is marked abandoned by the commerce worker.
  abandon_after_minutes integer not null default 60,
  -- { syncProducts, syncOrders, syncCustomers }
  settings jsonb not null default '{}'::jsonb,
  -- Last 4 characters of the signing secret, for display only.
  secret_hint text not null default '',
  secret_rotated_at timestamptz,
  last_event_at timestamptz,
  last_event_type text,
  last_error text,
  last_error_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint stores_platform_check check (platform in ('shopify', 'woocommerce', 'custom')),
  constraint stores_status_check check (status in ('pending', 'connected', 'error')),
  constraint stores_abandon_after_check check (abandon_after_minutes between 5 and 10080)
);

create index if not exists stores_project_idx
  on campaign.stores (project_id, created_at desc)
  where deleted_at is null;

-- Webhook signing secrets. No client policy at all: only the service role reads or writes.
create table if not exists campaign.store_secrets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  store_id uuid not null unique references campaign.stores(id) on delete cascade,
  secret text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Products --------------------------------------------------------------------

create table if not exists campaign.products (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- Null for products added by hand in Geiger.
  store_id uuid references campaign.stores(id) on delete cascade,
  external_id text,
  title text not null default 'Untitled product',
  handle text not null default '',
  sku text not null default '',
  price numeric(14, 2) not null default 0,
  compare_at_price numeric(14, 2),
  currency text not null default 'USD',
  image_url text,
  url text,
  -- Null when the store doesn't track inventory.
  inventory integer,
  categories text[] not null default '{}',
  -- active | draft | archived
  status text not null default 'active',
  published_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint products_status_check check (status in ('active', 'draft', 'archived')),
  constraint products_store_external_key unique (store_id, external_id)
);

create index if not exists products_project_idx
  on campaign.products (project_id, created_at desc)
  where deleted_at is null;
create index if not exists products_store_idx on campaign.products (store_id);
create index if not exists products_categories_idx on campaign.products using gin (categories);

-- Carts -----------------------------------------------------------------------

create table if not exists campaign.carts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  store_id uuid not null references campaign.stores(id) on delete cascade,
  contact_id uuid references campaign.contacts(id) on delete set null,
  external_id text,
  customer_email text,
  customer_name text not null default '',
  -- [{ product_id, external_id, title, sku, quantity, price, image_url, url }]
  items jsonb not null default '[]'::jsonb,
  value numeric(14, 2) not null default 0,
  currency text not null default 'USD',
  -- active | abandoned | recovered | converted
  status text not null default 'active',
  checkout_url text,
  last_activity_at timestamptz not null default now(),
  abandoned_at timestamptz,
  recovered_at timestamptz,
  recovered_value numeric(14, 2),
  reminders_sent integer not null default 0,
  last_reminded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint carts_status_check check (status in ('active', 'abandoned', 'recovered', 'converted')),
  constraint carts_store_external_key unique (store_id, external_id)
);

create index if not exists carts_project_idx
  on campaign.carts (project_id, last_activity_at desc)
  where deleted_at is null;
create index if not exists carts_due_idx
  on campaign.carts (store_id, last_activity_at)
  where status = 'active' and deleted_at is null;
create index if not exists carts_abandoned_idx
  on campaign.carts (project_id, abandoned_at)
  where status = 'abandoned' and deleted_at is null;
create index if not exists carts_contact_idx on campaign.carts (contact_id);

-- Orders ----------------------------------------------------------------------

create table if not exists campaign.orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  store_id uuid not null references campaign.stores(id) on delete cascade,
  contact_id uuid references campaign.contacts(id) on delete set null,
  cart_id uuid references campaign.carts(id) on delete set null,
  external_id text,
  number text not null default '',
  customer_email text,
  customer_name text not null default '',
  subtotal numeric(14, 2) not null default 0,
  discount numeric(14, 2) not null default 0,
  shipping numeric(14, 2) not null default 0,
  tax numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  refunded_amount numeric(14, 2) not null default 0,
  currency text not null default 'USD',
  -- [{ product_id, external_id, title, sku, quantity, price, image_url, url }]
  items jsonb not null default '[]'::jsonb,
  -- pending | paid | fulfilled | partially_refunded | refunded | cancelled
  status text not null default 'paid',
  coupon_code text,
  placed_at timestamptz not null default now(),
  attributed_campaign_id uuid references campaign.campaigns(id) on delete set null,
  -- { model: "last_click", window_days, delivery_id, campaign_id, source_type, source_id, clicked_at }
  attribution jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint orders_status_check check (
    status in ('pending', 'paid', 'fulfilled', 'partially_refunded', 'refunded', 'cancelled')
  ),
  constraint orders_store_external_key unique (store_id, external_id)
);

create index if not exists orders_project_idx
  on campaign.orders (project_id, placed_at desc)
  where deleted_at is null;
create index if not exists orders_contact_idx on campaign.orders (contact_id, placed_at desc);
create index if not exists orders_cart_idx on campaign.orders (cart_id) where cart_id is not null;
create index if not exists orders_campaign_idx
  on campaign.orders (attributed_campaign_id)
  where attributed_campaign_id is not null;
create index if not exists orders_coupon_idx
  on campaign.orders (project_id, upper(coupon_code))
  where coupon_code is not null;

-- The order a recovered or converted cart turned into.
alter table campaign.carts add column if not exists order_id uuid references campaign.orders(id) on delete set null;

-- Coupons ---------------------------------------------------------------------

create table if not exists campaign.coupons (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- Null applies to every store in the project.
  store_id uuid references campaign.stores(id) on delete set null,
  code text not null,
  -- percent | fixed | free_shipping
  kind text not null default 'percent',
  value numeric(14, 2) not null default 0,
  min_subtotal numeric(14, 2) not null default 0,
  -- Null means unlimited.
  usage_limit integer,
  per_customer_limit integer,
  used_count integer not null default 0,
  starts_at timestamptz,
  expires_at timestamptz,
  -- When true, shoppers redeem single-use codes from coupon_codes; `code` is the batch prefix.
  unique_codes boolean not null default false,
  -- active | paused (scheduled / expired / used up are derived from the dates and usage)
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint coupons_kind_check check (kind in ('percent', 'fixed', 'free_shipping')),
  constraint coupons_status_check check (status in ('active', 'paused'))
);

create unique index if not exists coupons_project_code_key
  on campaign.coupons (project_id, upper(code))
  where deleted_at is null;
create index if not exists coupons_project_idx
  on campaign.coupons (project_id, created_at desc)
  where deleted_at is null;

create table if not exists campaign.coupon_codes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  coupon_id uuid not null references campaign.coupons(id) on delete cascade,
  code text not null,
  -- Generation run this code came from, so a batch can be exported again.
  batch text not null default '',
  contact_id uuid references campaign.contacts(id) on delete set null,
  order_id uuid references campaign.orders(id) on delete set null,
  redeemed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists coupon_codes_project_code_key on campaign.coupon_codes (project_id, upper(code));
create index if not exists coupon_codes_coupon_idx on campaign.coupon_codes (coupon_id, created_at desc);
create index if not exists coupon_codes_project_idx
  on campaign.coupon_codes (project_id, created_at desc)
  where deleted_at is null;

-- Recommendation rules ----------------------------------------------------------

create table if not exists campaign.recommendation_rules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  store_id uuid references campaign.stores(id) on delete set null,
  name text not null default 'Untitled rule',
  -- bestsellers | trending | also_bought | recently_viewed | new_arrivals | category
  strategy text not null default 'bestsellers',
  -- { days, categories, minPrice, maxPrice, inStockOnly, excludePurchased }
  filters jsonb not null default '{}'::jsonb,
  -- Products returned per render ("limit" is reserved in PostgREST query strings).
  item_limit integer not null default 4,
  -- campaign_email | cart_email | browse_email | post_purchase
  placement text not null default 'campaign_email',
  -- active | paused
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint recommendation_rules_strategy_check check (
    strategy in ('bestsellers', 'trending', 'also_bought', 'recently_viewed', 'new_arrivals', 'category')
  ),
  constraint recommendation_rules_status_check check (status in ('active', 'paused')),
  constraint recommendation_rules_limit_check check (item_limit between 1 and 12)
);

create index if not exists recommendation_rules_project_idx
  on campaign.recommendation_rules (project_id, created_at desc)
  where deleted_at is null;

-- Coupon redemption (service role) ---------------------------------------------

-- Redeems one code for an order atomically: a single-use code from coupon_codes wins over a shared
-- coupon code; either way the parent coupon's used_count is incremented in the same statement set.
create or replace function campaign.commerce_redeem_coupon(p_project uuid, p_code text, p_contact uuid, p_order uuid)
returns jsonb
language plpgsql
security definer
set search_path = campaign
as $$
declare
  v_code campaign.coupon_codes%rowtype;
  v_coupon_id uuid;
begin
  if p_code is null or btrim(p_code) = '' then
    return jsonb_build_object('redeemed', false, 'reason', 'empty');
  end if;

  update campaign.coupon_codes
     set redeemed_at = now(), contact_id = coalesce(p_contact, contact_id), order_id = p_order
   where project_id = p_project
     and upper(code) = upper(btrim(p_code))
     and redeemed_at is null
     and deleted_at is null
  returning * into v_code;

  if found then
    v_coupon_id := v_code.coupon_id;
  else
    select id into v_coupon_id
      from campaign.coupons
     where project_id = p_project and upper(code) = upper(btrim(p_code)) and deleted_at is null
     limit 1;
  end if;

  if v_coupon_id is null then
    return jsonb_build_object('redeemed', false, 'reason', 'unknown_code');
  end if;

  update campaign.coupons set used_count = used_count + 1 where id = v_coupon_id;
  return jsonb_build_object('redeemed', true, 'coupon_id', v_coupon_id, 'code_id', v_code.id);
end;
$$;

revoke all on function campaign.commerce_redeem_coupon(uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function campaign.commerce_redeem_coupon(uuid, text, uuid, uuid) to service_role;

-- Access ----------------------------------------------------------------------

select campaign.apply_standard_access('stores', 'campaign.commerce.edit');
select campaign.apply_standard_access('products', 'campaign.commerce.edit');
select campaign.apply_standard_access('carts', 'campaign.commerce.edit');
select campaign.apply_standard_access('orders', 'campaign.commerce.edit');
select campaign.apply_standard_access('coupons', 'campaign.commerce.edit');
select campaign.apply_standard_access('coupon_codes', 'campaign.commerce.edit');
select campaign.apply_standard_access('recommendation_rules', 'campaign.commerce.edit');

alter table campaign.store_secrets enable row level security;
grant all on campaign.store_secrets to service_role;
drop trigger if exists store_secrets_touch_updated_at on campaign.store_secrets;
create trigger store_secrets_touch_updated_at
before update on campaign.store_secrets
for each row execute function campaign.touch_updated_at();

-- @down
drop function if exists campaign.commerce_redeem_coupon(uuid, text, uuid, uuid);
drop table if exists campaign.recommendation_rules cascade;
drop table if exists campaign.coupon_codes cascade;
drop table if exists campaign.coupons cascade;
alter table if exists campaign.carts drop column if exists order_id;
drop table if exists campaign.orders cascade;
drop table if exists campaign.carts cascade;
drop table if exists campaign.products cascade;
drop table if exists campaign.store_secrets cascade;
drop table if exists campaign.stores cascade;
