create table if not exists public.cakto_webhook_events (
  id uuid primary key default gen_random_uuid(),
  cakto_event_key text unique,
  event text not null,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  order_id text,
  offer_id text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cakto_webhook_events_event_idx
on public.cakto_webhook_events (event);

create index if not exists cakto_webhook_events_status_idx
on public.cakto_webhook_events (status);

create index if not exists cakto_webhook_events_order_id_idx
on public.cakto_webhook_events (order_id);

create index if not exists cakto_webhook_events_offer_id_idx
on public.cakto_webhook_events (offer_id);

create index if not exists cakto_webhook_events_received_at_idx
on public.cakto_webhook_events (received_at);

create index if not exists cakto_webhook_events_processed_at_idx
on public.cakto_webhook_events (processed_at);

create table if not exists public.cakto_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  cakto_order_id text not null unique,
  cakto_ref_id text,
  cakto_subscription_id text,
  cakto_checkout_id text,
  cakto_offer_id text not null,
  cakto_product_id text,
  billing_cycle text not null check (billing_cycle in ('monthly', 'quarterly', 'annual')),
  internal_access_plan text not null default 'pro' check (internal_access_plan in ('pro')),
  status text not null,
  customer_email text,
  customer_name text,
  customer_document text,
  amount_cents integer,
  payment_method text,
  paid_at timestamptz,
  checkout_url text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cakto_orders_user_id_idx
on public.cakto_orders (user_id);

create index if not exists cakto_orders_cakto_ref_id_idx
on public.cakto_orders (cakto_ref_id);

create index if not exists cakto_orders_cakto_subscription_id_idx
on public.cakto_orders (cakto_subscription_id);

create index if not exists cakto_orders_cakto_offer_id_idx
on public.cakto_orders (cakto_offer_id);

create index if not exists cakto_orders_cakto_product_id_idx
on public.cakto_orders (cakto_product_id);

create index if not exists cakto_orders_billing_cycle_idx
on public.cakto_orders (billing_cycle);

create index if not exists cakto_orders_status_idx
on public.cakto_orders (status);

create index if not exists cakto_orders_customer_email_idx
on public.cakto_orders (customer_email);

create index if not exists cakto_orders_paid_at_idx
on public.cakto_orders (paid_at);

alter table public.cakto_webhook_events enable row level security;
alter table public.cakto_orders enable row level security;

drop trigger if exists set_cakto_webhook_events_updated_at on public.cakto_webhook_events;
create trigger set_cakto_webhook_events_updated_at
before update on public.cakto_webhook_events
for each row
execute function public.set_updated_at();

drop trigger if exists set_cakto_orders_updated_at on public.cakto_orders;
create trigger set_cakto_orders_updated_at
before update on public.cakto_orders
for each row
execute function public.set_updated_at();

drop policy if exists "Admins can manage Cakto webhook events" on public.cakto_webhook_events;
create policy "Admins can manage Cakto webhook events"
on public.cakto_webhook_events
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Users can view their own Cakto orders" on public.cakto_orders;
create policy "Users can view their own Cakto orders"
on public.cakto_orders
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Admins can manage Cakto orders" on public.cakto_orders;
create policy "Admins can manage Cakto orders"
on public.cakto_orders
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));
