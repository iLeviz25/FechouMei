alter table public.profiles
add column if not exists role text not null default 'user';

update public.profiles
set role = 'user'
where role is null
   or role not in ('user', 'admin');

alter table public.profiles
alter column role set default 'user';

alter table public.profiles
alter column role set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_role_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
    add constraint profiles_role_check
    check (role in ('user', 'admin'));
  end if;
end $$;

create index if not exists profiles_role_idx
on public.profiles (role);

create or replace function public.is_admin(user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select profile.role = 'admin'
      from public.profiles as profile
      where profile.id = user_id
    ),
    false
  );
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated;

create or replace function public.prevent_non_admin_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  database_role text := current_user;
  actor_is_admin boolean := public.is_admin(auth.uid());
  actor_can_manage_roles boolean := actor_is_admin
    or jwt_role = 'service_role'
    or database_role in ('service_role', 'postgres', 'supabase_admin');
begin
  if tg_op = 'INSERT' then
    new.role = coalesce(new.role, 'user');

    if new.role <> 'user' and not actor_can_manage_roles then
      raise exception 'Only admins can create admin profiles.'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if new.role is distinct from old.role and not actor_can_manage_roles then
    raise exception 'Only admins can change profile roles.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_non_admin_role_change_before_write on public.profiles;
create trigger prevent_non_admin_role_change_before_write
before insert or update on public.profiles
for each row
execute function public.prevent_non_admin_role_change();

revoke all on function public.prevent_non_admin_role_change() from public;

drop policy if exists "Admins can view all profiles" on public.profiles;
create policy "Admins can view all profiles"
on public.profiles
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "Admins can update all profiles" on public.profiles;
create policy "Admins can update all profiles"
on public.profiles
for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create or replace function public.set_user_role(target_user_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can change user roles.'
      using errcode = '42501';
  end if;

  if new_role not in ('user', 'admin') then
    raise exception 'Invalid role: %. Allowed roles are user and admin.', new_role
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = target_user_id
  ) then
    raise exception 'Target user profile does not exist: %', target_user_id
      using errcode = 'P0002';
  end if;

  update public.profiles
  set role = new_role
  where id = target_user_id;
end;
$$;

revoke all on function public.set_user_role(uuid, text) from public;
grant execute on function public.set_user_role(uuid, text) to authenticated;
