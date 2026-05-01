create or replace function public.prevent_non_admin_subscription_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
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
