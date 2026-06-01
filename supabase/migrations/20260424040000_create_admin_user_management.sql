create or replace function public.get_admin_users(
  search_text text default null,
  role_filter text default null,
  whatsapp_filter text default null,
  page_size integer default 20,
  page_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_search text := lower(trim(coalesce(search_text, '')));
  normalized_role text := nullif(trim(coalesce(role_filter, '')), '');
  normalized_whatsapp text := nullif(trim(coalesce(whatsapp_filter, '')), '');
  safe_page_size integer := least(greatest(coalesce(page_size, 20), 1), 100);
  safe_page_offset integer := greatest(coalesce(page_offset, 0), 0);
  result jsonb;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can list users.'
      using errcode = '42501';
  end if;

  if normalized_role is not null and normalized_role not in ('user', 'admin') then
    raise exception 'Invalid role filter: %', normalized_role
      using errcode = '22023';
  end if;

  if normalized_whatsapp is not null and normalized_whatsapp not in ('linked', 'unlinked') then
    raise exception 'Invalid WhatsApp filter: %', normalized_whatsapp
      using errcode = '22023';
  end if;

  with movement_counts as (
    select
      user_id,
      count(*) as movements_count,
      max(created_at) as last_movement_at
    from public.movimentacoes
    group by user_id
  ),
  message_counts as (
    select
      user_id,
      count(*) as helena_messages_count,
      max(created_at) as last_message_at
    from public.agent_messages
    group by user_id
  ),
  filtered as (
    select
      profiles.id,
      profiles.full_name,
      auth_users.email,
      profiles.role,
      profiles.created_at,
      profiles.updated_at,
      auth_users.last_sign_in_at,
      whatsapp.status as whatsapp_status,
      whatsapp.linked_at as whatsapp_linked_at,
      whatsapp.last_inbound_at as whatsapp_last_inbound_at,
      coalesce(movement_counts.movements_count, 0) as movements_count,
      coalesce(message_counts.helena_messages_count, 0) as helena_messages_count,
      greatest(
        profiles.updated_at,
        coalesce(auth_users.last_sign_in_at, profiles.updated_at),
        coalesce(movement_counts.last_movement_at, profiles.updated_at),
        coalesce(message_counts.last_message_at, profiles.updated_at),
        coalesce(whatsapp.last_inbound_at, profiles.updated_at)
      ) as last_activity_at
    from public.profiles
    left join auth.users as auth_users on auth_users.id = profiles.id
    left join public.whatsapp_assistant_links as whatsapp on whatsapp.user_id = profiles.id
    left join movement_counts on movement_counts.user_id = profiles.id
    left join message_counts on message_counts.user_id = profiles.id
    where (
      normalized_search = ''
      or lower(coalesce(profiles.full_name, '')) like '%' || normalized_search || '%'
      or lower(coalesce(auth_users.email, '')) like '%' || normalized_search || '%'
    )
      and (normalized_role is null or profiles.role = normalized_role)
      and (
        normalized_whatsapp is null
        or (normalized_whatsapp = 'linked' and whatsapp.status = 'linked')
        or (normalized_whatsapp = 'unlinked' and coalesce(whatsapp.status, 'none') <> 'linked')
      )
  ),
  paged as (
    select *
    from filtered
    order by created_at desc
    limit safe_page_size
    offset safe_page_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'pageSize', safe_page_size,
    'pageOffset', safe_page_offset,
    'users', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', paged.id,
            'fullName', paged.full_name,
            'email', paged.email,
            'role', paged.role,
            'createdAt', paged.created_at,
            'updatedAt', paged.updated_at,
            'lastSignInAt', paged.last_sign_in_at,
            'lastActivityAt', paged.last_activity_at,
            'whatsappStatus', coalesce(paged.whatsapp_status, 'none'),
            'whatsappLinkedAt', paged.whatsapp_linked_at,
            'whatsappLastInboundAt', paged.whatsapp_last_inbound_at,
            'movementsCount', paged.movements_count,
            'helenaMessagesCount', paged.helena_messages_count
          )
          order by paged.created_at desc
        )
        from paged
      ),
      '[]'::jsonb
    )
  )
  into result;

  return result;
end;
$$;

revoke all on function public.get_admin_users(text, text, text, integer, integer) from public;
grant execute on function public.get_admin_users(text, text, text, integer, integer) to authenticated;

create or replace function public.get_admin_user_detail(target_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can read user details.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles
    where profiles.id = target_user_id
  ) then
    return null;
  end if;

  with movement_metrics as (
    select
      user_id,
      count(*) as total,
      count(*) filter (where type = 'entrada') as entradas,
      count(*) filter (where type = 'despesa') as despesas,
      max(created_at) as last_movement_at
    from public.movimentacoes
    where user_id = target_user_id
    group by user_id
  ),
  message_metrics as (
    select
      user_id,
      count(*) as total,
      max(created_at) as last_message_at
    from public.agent_messages
    where user_id = target_user_id
    group by user_id
  ),
  latest_events as (
    select *
    from (
      select
        'Movimentacao'::text as source,
        movimentacoes.type as kind,
        movimentacoes.description as title,
        movimentacoes.category as detail,
        movimentacoes.created_at
      from public.movimentacoes
      where movimentacoes.user_id = target_user_id
      union all
      select
        'Helena'::text as source,
        agent_action_events.status as kind,
        agent_action_events.action as title,
        coalesce(agent_action_events.error, agent_action_events.summary) as detail,
        agent_action_events.created_at
      from public.agent_action_events
      where agent_action_events.user_id = target_user_id
      union all
      select
        'WhatsApp'::text as source,
        agent_channel_events.status as kind,
        agent_channel_events.provider as title,
        coalesce(agent_channel_events.error, agent_channel_events.summary) as detail,
        agent_channel_events.created_at
      from public.agent_channel_events
      where agent_channel_events.user_id = target_user_id
    ) as events
    order by created_at desc
    limit 8
  )
  select jsonb_build_object(
    'id', profiles.id,
    'fullName', profiles.full_name,
    'email', auth_users.email,
    'role', profiles.role,
    'createdAt', profiles.created_at,
    'updatedAt', profiles.updated_at,
    'lastSignInAt', auth_users.last_sign_in_at,
    'workType', profiles.work_type,
    'businessMode', profiles.business_mode,
    'mainCategory', profiles.main_category,
    'mainGoal', profiles.main_goal,
    'onboardingCompleted', profiles.onboarding_completed,
    'whatsapp', jsonb_build_object(
      'status', coalesce(whatsapp.status, 'none'),
      'linkedAt', whatsapp.linked_at,
      'lastInboundAt', whatsapp.last_inbound_at
    ),
    'metrics', jsonb_build_object(
      'movementsTotal', coalesce(movement_metrics.total, 0),
      'entradasTotal', coalesce(movement_metrics.entradas, 0),
      'despesasTotal', coalesce(movement_metrics.despesas, 0),
      'helenaMessagesTotal', coalesce(message_metrics.total, 0),
      'lastActivityAt', greatest(
        profiles.updated_at,
        coalesce(auth_users.last_sign_in_at, profiles.updated_at),
        coalesce(movement_metrics.last_movement_at, profiles.updated_at),
        coalesce(message_metrics.last_message_at, profiles.updated_at),
        coalesce(whatsapp.last_inbound_at, profiles.updated_at)
      )
    ),
    'recentEvents', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'source', latest_events.source,
            'kind', latest_events.kind,
            'title', latest_events.title,
            'detail', latest_events.detail,
            'createdAt', latest_events.created_at
          )
          order by latest_events.created_at desc
        )
        from latest_events
      ),
      '[]'::jsonb
    )
  )
  into result
  from public.profiles
  left join auth.users as auth_users on auth_users.id = profiles.id
  left join public.whatsapp_assistant_links as whatsapp on whatsapp.user_id = profiles.id
  left join movement_metrics on movement_metrics.user_id = profiles.id
  left join message_metrics on message_metrics.user_id = profiles.id
  where profiles.id = target_user_id;

  return result;
end;
$$;

revoke all on function public.get_admin_user_detail(uuid) from public;
grant execute on function public.get_admin_user_detail(uuid) to authenticated;

create or replace function public.set_user_role(target_user_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  current_role text;
  admin_count bigint;
begin
  if not public.is_admin(actor_id) then
    raise exception 'Only admins can change user roles.'
      using errcode = '42501';
  end if;

  if new_role not in ('user', 'admin') then
    raise exception 'Invalid role: %. Allowed roles are user and admin.', new_role
      using errcode = '22023';
  end if;

  select role
  into current_role
  from public.profiles
  where id = target_user_id;

  if current_role is null then
    raise exception 'Target user profile does not exist: %', target_user_id
      using errcode = 'P0002';
  end if;

  if actor_id = target_user_id and new_role <> 'admin' then
    raise exception 'Admins cannot remove their own admin access.'
      using errcode = '42501';
  end if;

  if current_role = 'admin' and new_role = 'user' then
    select count(*)
    into admin_count
    from public.profiles
    where role = 'admin';

    if admin_count <= 1 then
      raise exception 'Cannot demote the last admin.'
        using errcode = '42501';
    end if;
  end if;

  update public.profiles
  set role = new_role
  where id = target_user_id;
end;
$$;

revoke all on function public.set_user_role(uuid, text) from public;
grant execute on function public.set_user_role(uuid, text) to authenticated;
