create table if not exists public.asaas_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  asaas_customer_id text not null unique,
  email text,
  name text,
  cpf_cnpj text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists asaas_customers_user_id_idx
on public.asaas_customers (user_id);

create index if not exists asaas_customers_email_idx
on public.asaas_customers (email);

create table if not exists public.asaas_checkouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  billing_cycle text not null check (billing_cycle in ('monthly', 'semiannual', 'annual')),
  internal_access_plan text not null default 'pro' check (internal_access_plan in ('pro')),
  status text not null default 'created',
  external_reference text unique,
  asaas_checkout_id text unique,
  checkout_url text,
  raw_request jsonb,
  raw_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists asaas_checkouts_user_id_idx
on public.asaas_checkouts (user_id);

create index if not exists asaas_checkouts_billing_cycle_idx
on public.asaas_checkouts (billing_cycle);

create index if not exists asaas_checkouts_status_idx
on public.asaas_checkouts (status);

create table if not exists public.asaas_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  billing_cycle text not null check (billing_cycle in ('monthly', 'semiannual', 'annual')),
  internal_access_plan text not null default 'pro' check (internal_access_plan in ('pro')),
  asaas_subscription_id text not null unique,
  asaas_customer_id text,
  status text not null,
  current_period_start date,
  current_period_end date,
  next_due_date date,
  canceled_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists asaas_subscriptions_user_id_idx
on public.asaas_subscriptions (user_id);

create index if not exists asaas_subscriptions_billing_cycle_idx
on public.asaas_subscriptions (billing_cycle);

create index if not exists asaas_subscriptions_asaas_customer_id_idx
on public.asaas_subscriptions (asaas_customer_id);

create index if not exists asaas_subscriptions_status_idx
on public.asaas_subscriptions (status);

create index if not exists asaas_subscriptions_next_due_date_idx
on public.asaas_subscriptions (next_due_date);

create table if not exists public.asaas_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  billing_cycle text check (billing_cycle in ('monthly', 'semiannual', 'annual')),
  internal_access_plan text default 'pro' check (internal_access_plan in ('pro')),
  asaas_payment_id text not null unique,
  asaas_subscription_id text,
  asaas_checkout_id text,
  asaas_customer_id text,
  status text not null,
  value_cents integer,
  billing_type text,
  due_date date,
  paid_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists asaas_payments_user_id_idx
on public.asaas_payments (user_id);

create index if not exists asaas_payments_billing_cycle_idx
on public.asaas_payments (billing_cycle);

create index if not exists asaas_payments_asaas_subscription_id_idx
on public.asaas_payments (asaas_subscription_id);

create index if not exists asaas_payments_asaas_customer_id_idx
on public.asaas_payments (asaas_customer_id);

create index if not exists asaas_payments_status_idx
on public.asaas_payments (status);

create index if not exists asaas_payments_due_date_idx
on public.asaas_payments (due_date);

create index if not exists asaas_payments_paid_at_idx
on public.asaas_payments (paid_at);

create table if not exists public.asaas_webhook_events (
  id uuid primary key default gen_random_uuid(),
  asaas_event_id text unique,
  event text not null,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists asaas_webhook_events_event_idx
on public.asaas_webhook_events (event);

create index if not exists asaas_webhook_events_status_idx
on public.asaas_webhook_events (status);

create index if not exists asaas_webhook_events_received_at_idx
on public.asaas_webhook_events (received_at);

create index if not exists asaas_webhook_events_processed_at_idx
on public.asaas_webhook_events (processed_at);

alter table public.asaas_customers enable row level security;
alter table public.asaas_checkouts enable row level security;
alter table public.asaas_subscriptions enable row level security;
alter table public.asaas_payments enable row level security;
alter table public.asaas_webhook_events enable row level security;

drop trigger if exists set_asaas_customers_updated_at on public.asaas_customers;
create trigger set_asaas_customers_updated_at
before update on public.asaas_customers
for each row
execute function public.set_updated_at();

drop trigger if exists set_asaas_checkouts_updated_at on public.asaas_checkouts;
create trigger set_asaas_checkouts_updated_at
before update on public.asaas_checkouts
for each row
execute function public.set_updated_at();

drop trigger if exists set_asaas_subscriptions_updated_at on public.asaas_subscriptions;
create trigger set_asaas_subscriptions_updated_at
before update on public.asaas_subscriptions
for each row
execute function public.set_updated_at();

drop trigger if exists set_asaas_payments_updated_at on public.asaas_payments;
create trigger set_asaas_payments_updated_at
before update on public.asaas_payments
for each row
execute function public.set_updated_at();

drop trigger if exists set_asaas_webhook_events_updated_at on public.asaas_webhook_events;
create trigger set_asaas_webhook_events_updated_at
before update on public.asaas_webhook_events
for each row
execute function public.set_updated_at();

drop policy if exists "Users can view their own Asaas customers" on public.asaas_customers;
create policy "Users can view their own Asaas customers"
on public.asaas_customers
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Admins can manage Asaas customers" on public.asaas_customers;
create policy "Admins can manage Asaas customers"
on public.asaas_customers
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Users can view their own Asaas checkouts" on public.asaas_checkouts;
create policy "Users can view their own Asaas checkouts"
on public.asaas_checkouts
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Admins can manage Asaas checkouts" on public.asaas_checkouts;
create policy "Admins can manage Asaas checkouts"
on public.asaas_checkouts
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Users can view their own Asaas subscriptions" on public.asaas_subscriptions;
create policy "Users can view their own Asaas subscriptions"
on public.asaas_subscriptions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Admins can manage Asaas subscriptions" on public.asaas_subscriptions;
create policy "Admins can manage Asaas subscriptions"
on public.asaas_subscriptions
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Users can view their own Asaas payments" on public.asaas_payments;
create policy "Users can view their own Asaas payments"
on public.asaas_payments
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Admins can manage Asaas payments" on public.asaas_payments;
create policy "Admins can manage Asaas payments"
on public.asaas_payments
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can manage Asaas webhook events" on public.asaas_webhook_events;
create policy "Admins can manage Asaas webhook events"
on public.asaas_webhook_events
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));
