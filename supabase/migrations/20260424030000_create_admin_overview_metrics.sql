create or replace function public.get_admin_overview_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since_7_days timestamptz := now() - interval '7 days';
  since_30_days timestamptz := now() - interval '30 days';
  users_total bigint := 0;
  users_last_7_days bigint := 0;
  users_last_30_days bigint := 0;
  role_user_total bigint := 0;
  role_admin_total bigint := 0;
  whatsapp_linked_users bigint := 0;
  whatsapp_total_links bigint := 0;
  movements_total bigint := 0;
  movements_entrada_total bigint := 0;
  movements_despesa_total bigint := 0;
  movements_last_7_days bigint := 0;
  agent_messages_total bigint := 0;
  agent_messages_last_7_days bigint := 0;
  recent_errors_total bigint := 0;
  recent_users jsonb := '[]'::jsonb;
  recent_movements jsonb := '[]'::jsonb;
  recent_error_events jsonb := '[]'::jsonb;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can read overview metrics.'
      using errcode = '42501';
  end if;

  select
    count(*),
    count(*) filter (where created_at >= since_7_days),
    count(*) filter (where created_at >= since_30_days),
    count(*) filter (where role = 'user'),
    count(*) filter (where role = 'admin')
  into
    users_total,
    users_last_7_days,
    users_last_30_days,
    role_user_total,
    role_admin_total
  from public.profiles;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', recent.id,
        'fullName', recent.full_name,
        'role', recent.role,
        'createdAt', recent.created_at
      )
      order by recent.created_at desc
    ),
    '[]'::jsonb
  )
  into recent_users
  from (
    select id, full_name, role, created_at
    from public.profiles
    order by created_at desc
    limit 5
  ) as recent;

  select count(*)
  into whatsapp_total_links
  from public.whatsapp_assistant_links;

  select count(distinct user_id)
  into whatsapp_linked_users
  from public.whatsapp_assistant_links
  where status = 'linked';

  select
    count(*),
    count(*) filter (where type = 'entrada'),
    count(*) filter (where type = 'despesa'),
    count(*) filter (where created_at >= since_7_days)
  into
    movements_total,
    movements_entrada_total,
    movements_despesa_total,
    movements_last_7_days
  from public.movimentacoes;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', recent.id,
        'type', recent.type,
        'description', recent.description,
        'category', recent.category,
        'amount', recent.amount,
        'occurredOn', recent.occurred_on,
        'createdAt', recent.created_at,
        'userName', recent.full_name
      )
      order by recent.created_at desc
    ),
    '[]'::jsonb
  )
  into recent_movements
  from (
    select
      movimentacoes.id,
      movimentacoes.type,
      movimentacoes.description,
      movimentacoes.category,
      movimentacoes.amount,
      movimentacoes.occurred_on,
      movimentacoes.created_at,
      profiles.full_name
    from public.movimentacoes
    left join public.profiles on profiles.id = movimentacoes.user_id
    order by movimentacoes.created_at desc
    limit 6
  ) as recent;

  select
    count(*),
    count(*) filter (where created_at >= since_7_days)
  into agent_messages_total, agent_messages_last_7_days
  from public.agent_messages;

  select count(*)
  into recent_errors_total
  from (
    select id
    from public.agent_action_events
    where created_at >= since_7_days
      and (status = 'failed' or error is not null)
    union all
    select id
    from public.agent_channel_events
    where created_at >= since_7_days
      and (status = 'failed' or error is not null)
  ) as errors;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'source', recent.source,
        'title', recent.title,
        'status', recent.status,
        'detail', recent.detail,
        'createdAt', recent.created_at
      )
      order by recent.created_at desc
    ),
    '[]'::jsonb
  )
  into recent_error_events
  from (
    select
      'Helena'::text as source,
      action as title,
      status,
      coalesce(error, summary) as detail,
      created_at
    from public.agent_action_events
    where status = 'failed' or error is not null
    union all
    select
      'WhatsApp'::text as source,
      provider as title,
      status,
      coalesce(error, summary) as detail,
      created_at
    from public.agent_channel_events
    where status = 'failed' or error is not null
    order by created_at desc
    limit 5
  ) as recent;

  return jsonb_build_object(
    'generatedAt', now(),
    'users', jsonb_build_object(
      'available', true,
      'total', users_total,
      'createdLast7Days', users_last_7_days,
      'createdLast30Days', users_last_30_days,
      'recent', recent_users
    ),
    'roles', jsonb_build_object(
      'available', true,
      'user', role_user_total,
      'admin', role_admin_total
    ),
    'whatsapp', jsonb_build_object(
      'available', true,
      'linkedUsers', whatsapp_linked_users,
      'unlinkedUsers', greatest(users_total - whatsapp_linked_users, 0),
      'totalLinks', whatsapp_total_links,
      'activationPercentage',
        case
          when users_total = 0 then 0
          else round((whatsapp_linked_users::numeric / users_total::numeric) * 100, 1)
        end
    ),
    'movements', jsonb_build_object(
      'available', true,
      'total', movements_total,
      'entradas', movements_entrada_total,
      'despesas', movements_despesa_total,
      'createdLast7Days', movements_last_7_days,
      'recent', recent_movements
    ),
    'helena', jsonb_build_object(
      'available', true,
      'messagesTotal', agent_messages_total,
      'messagesLast7Days', agent_messages_last_7_days
    ),
    'errors', jsonb_build_object(
      'available', true,
      'recentTotal', recent_errors_total,
      'recent', recent_error_events
    ),
    'health', jsonb_build_object(
      'available', true,
      'database', 'connected',
      'admin', 'active',
      'whatsapp', 'available',
      'helena', 'available',
      'logs', 'available'
    )
  );
end;
$$;

revoke all on function public.get_admin_overview_metrics() from public;
grant execute on function public.get_admin_overview_metrics() to authenticated;
