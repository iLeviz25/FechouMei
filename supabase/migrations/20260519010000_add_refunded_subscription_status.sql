alter table public.profiles
drop constraint if exists profiles_subscription_status_check;

alter table public.profiles
add constraint profiles_subscription_status_check
check (subscription_status in ('active', 'pending_payment', 'past_due', 'canceled', 'refunded'));

alter table public.cakto_orders
add column if not exists refunded_at timestamptz,
add column if not exists access_revoked_at timestamptz;

create index if not exists cakto_orders_refunded_at_idx
on public.cakto_orders (refunded_at);

create index if not exists cakto_orders_access_revoked_at_idx
on public.cakto_orders (access_revoked_at);

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
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_admin(auth.uid()) then
    raise exception 'Only admins can change subscriptions.'
      using errcode = '42501';
  end if;

  if new_plan not in ('essential', 'pro') then
    raise exception 'Invalid subscription plan: %', new_plan
      using errcode = '22023';
  end if;

  if new_status not in ('active', 'pending_payment', 'past_due', 'canceled', 'refunded') then
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
