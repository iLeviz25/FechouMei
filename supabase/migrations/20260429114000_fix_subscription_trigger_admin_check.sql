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
