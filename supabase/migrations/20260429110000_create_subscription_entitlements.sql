alter table public.profiles
add column if not exists subscription_plan text,
add column if not exists subscription_status text;

update public.profiles
set subscription_plan = 'essential'
where subscription_plan is null
   or subscription_plan not in ('essential', 'pro');

update public.profiles
set subscription_status = 'pending_payment'
where subscription_status is null
   or subscription_status not in ('active', 'pending_payment', 'past_due', 'canceled');

alter table public.profiles
alter column subscription_plan set default 'essential',
alter column subscription_plan set not null,
alter column subscription_status set default 'pending_payment',
alter column subscription_status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_subscription_plan_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
    add constraint profiles_subscription_plan_check
    check (subscription_plan in ('essential', 'pro'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_subscription_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
    add constraint profiles_subscription_status_check
    check (subscription_status in ('active', 'pending_payment', 'past_due', 'canceled'));
  end if;
end $$;

create index if not exists profiles_subscription_idx
on public.profiles (subscription_status, subscription_plan);

create or replace function public.prevent_non_admin_subscription_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  actor_is_admin boolean := public.is_admin(auth.uid());
  actor_can_manage_subscriptions boolean := actor_is_admin
    or jwt_role = 'service_role';
begin
  if tg_op = 'INSERT' then
    new.subscription_plan = coalesce(new.subscription_plan, 'essential');
    new.subscription_status = coalesce(new.subscription_status, 'pending_payment');

    if (
      new.subscription_plan <> 'essential'
      or new.subscription_status <> 'pending_payment'
    ) and not actor_can_manage_subscriptions then
      raise exception 'Only admins can create active subscriptions.'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if (
    new.subscription_plan is distinct from old.subscription_plan
    or new.subscription_status is distinct from old.subscription_status
  ) and not actor_can_manage_subscriptions then
    raise exception 'Only admins can change subscriptions.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_non_admin_subscription_change_before_write on public.profiles;
create trigger prevent_non_admin_subscription_change_before_write
before insert or update on public.profiles
for each row
execute function public.prevent_non_admin_subscription_change();

revoke all on function public.prevent_non_admin_subscription_change() from public;

create table if not exists public.helena_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  message_count integer not null default 0 check (message_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

create index if not exists helena_daily_usage_date_idx
on public.helena_daily_usage (usage_date desc);

alter table public.helena_daily_usage enable row level security;

drop policy if exists "Users can view their own Helena daily usage" on public.helena_daily_usage;
create policy "Users can view their own Helena daily usage"
on public.helena_daily_usage
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Admins can view all Helena daily usage" on public.helena_daily_usage;
create policy "Admins can view all Helena daily usage"
on public.helena_daily_usage
for select
to authenticated
using (public.is_admin(auth.uid()));

drop trigger if exists set_helena_daily_usage_updated_at on public.helena_daily_usage;
create trigger set_helena_daily_usage_updated_at
before update on public.helena_daily_usage
for each row
execute function public.set_updated_at();

create or replace function public.set_user_subscription(
  target_user_id uuid,
  new_plan text,
  new_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can change subscriptions.'
      using errcode = '42501';
  end if;

  if new_plan not in ('essential', 'pro') then
    raise exception 'Invalid subscription plan: %', new_plan
      using errcode = '22023';
  end if;

  if new_status not in ('active', 'pending_payment', 'past_due', 'canceled') then
    raise exception 'Invalid subscription status: %', new_status
      using errcode = '22023';
  end if;

  update public.profiles
  set subscription_plan = new_plan,
      subscription_status = new_status
  where id = target_user_id;

  if not found then
    raise exception 'Target user profile does not exist: %', target_user_id
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_user_subscription(uuid, text, text) from public;
grant execute on function public.set_user_subscription(uuid, text, text) to authenticated;

create or replace function public.consume_helena_daily_message(
  target_user_id uuid,
  usage_date date default (timezone('America/Sao_Paulo', now())::date)
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_profile public.profiles%rowtype;
  safe_usage_date date := coalesce(usage_date, timezone('America/Sao_Paulo', now())::date);
  daily_limit integer;
  used_count integer;
begin
  if target_user_id is null then
    raise exception 'target_user_id is required.'
      using errcode = '22023';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_admin(auth.uid())
     and auth.uid() is distinct from target_user_id then
    raise exception 'Not allowed to consume Helena usage for another user.'
      using errcode = '42501';
  end if;

  select *
  into target_profile
  from public.profiles
  where id = target_user_id;

  if not found then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'pending_payment',
      'plan', 'essential',
      'status', 'pending_payment',
      'limit', 30,
      'used', 0,
      'remaining', 30
    );
  end if;

  if target_profile.role = 'admin' then
    return jsonb_build_object(
      'allowed', true,
      'reason', 'admin',
      'plan', coalesce(target_profile.subscription_plan, 'pro'),
      'status', coalesce(target_profile.subscription_status, 'active'),
      'limit', null,
      'used', 0,
      'remaining', null
    );
  end if;

  if target_profile.subscription_status <> 'active' then
    return jsonb_build_object(
      'allowed', false,
      'reason', target_profile.subscription_status,
      'plan', target_profile.subscription_plan,
      'status', target_profile.subscription_status,
      'limit', case when target_profile.subscription_plan = 'pro' then 100 else 30 end,
      'used', 0,
      'remaining', case when target_profile.subscription_plan = 'pro' then 100 else 30 end
    );
  end if;

  daily_limit := case when target_profile.subscription_plan = 'pro' then 100 else 30 end;

  insert into public.helena_daily_usage (user_id, usage_date, message_count)
  values (target_user_id, safe_usage_date, 0)
  on conflict on constraint helena_daily_usage_pkey do nothing;

  update public.helena_daily_usage usage_row
  set message_count = usage_row.message_count + 1
  where usage_row.user_id = target_user_id
    and usage_row.usage_date = safe_usage_date
    and usage_row.message_count < daily_limit
  returning usage_row.message_count into used_count;

  if used_count is null then
    select message_count
    into used_count
    from public.helena_daily_usage usage_row
    where usage_row.user_id = target_user_id
      and usage_row.usage_date = safe_usage_date;

    return jsonb_build_object(
      'allowed', false,
      'reason', 'daily_limit_reached',
      'plan', target_profile.subscription_plan,
      'status', target_profile.subscription_status,
      'limit', daily_limit,
      'used', coalesce(used_count, daily_limit),
      'remaining', 0
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'reason', 'allowed',
    'plan', target_profile.subscription_plan,
    'status', target_profile.subscription_status,
    'limit', daily_limit,
    'used', used_count,
    'remaining', greatest(daily_limit - used_count, 0)
  );
end;
$$;

revoke all on function public.consume_helena_daily_message(uuid, date) from public;
grant execute on function public.consume_helena_daily_message(uuid, date) to authenticated, service_role;
