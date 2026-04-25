create or replace function public.sanitize_admin_prompt_text(input_text text)
returns text
language plpgsql
immutable
security definer
set search_path = public
as $$
declare
  sanitized text := coalesce(input_text, '');
begin
  sanitized := regexp_replace(
    sanitized,
    '(?i)(bearer\s+)[A-Za-z0-9._~+/-]+=*',
    '\1[redacted]',
    'g'
  );

  sanitized := regexp_replace(
    sanitized,
    '(?i)(api[_-]?key|service[_-]?role|token|secret|password|senha)(\s*[:=]\s*)\S+',
    '\1\2[redacted]',
    'g'
  );

  sanitized := regexp_replace(
    sanitized,
    '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}',
    '[email]',
    'gi'
  );

  sanitized := regexp_replace(
    sanitized,
    '(?i)(x-goog-api-key|authorization|cookie|set-cookie)(\s*[:=]\s*)\S+',
    '\1\2[redacted]',
    'g'
  );
  sanitized := regexp_replace(
    sanitized,
    '\+?\d[\d\s().-]{7,}\d',
    '[phone]',
    'g'
  );

  return sanitized;
end;
$$;

revoke all on function public.sanitize_admin_prompt_text(text) from public;

create table if not exists public.agent_prompt_traces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  channel text not null default 'playground' check (channel in ('playground', 'whatsapp', 'system')),
  model text,
  trace_type text not null default 'interpretation' check (trace_type in ('interpretation', 'transcription', 'routing', 'fallback')),
  status text not null default 'success' check (status in ('success', 'error', 'skipped')),
  action_name text,
  prompt_preview text,
  prompt_text text,
  user_message_preview text,
  response_preview text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_prompt_traces_created_idx
on public.agent_prompt_traces (created_at desc);

create index if not exists agent_prompt_traces_user_created_idx
on public.agent_prompt_traces (user_id, created_at desc);

create index if not exists agent_prompt_traces_channel_status_idx
on public.agent_prompt_traces (channel, status, created_at desc);

alter table public.agent_prompt_traces enable row level security;

drop policy if exists "Admins can view agent prompt traces" on public.agent_prompt_traces;
create policy "Admins can view agent prompt traces"
on public.agent_prompt_traces
for select
to authenticated
using (public.is_admin(auth.uid()));

create or replace function public.record_agent_prompt_trace(
  target_user_id uuid,
  trace_channel text,
  trace_model text,
  trace_type text,
  trace_status text,
  action_name text,
  prompt_text text,
  user_message text default null,
  response_text text default null,
  metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  safe_channel text := coalesce(nullif(trim(trace_channel), ''), 'playground');
  safe_trace_type text := coalesce(nullif(trim(trace_type), ''), 'interpretation');
  safe_status text := coalesce(nullif(trim(trace_status), ''), 'success');
  safe_prompt text := left(public.sanitize_admin_prompt_text(prompt_text), 20000);
  safe_user_message text := left(public.sanitize_admin_prompt_text(user_message), 500);
  safe_response text := left(public.sanitize_admin_prompt_text(response_text), 1000);
  inserted_id uuid;
begin
  if target_user_id is null then
    raise exception 'target_user_id is required.'
      using errcode = '22023';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_admin(actor_id)
     and actor_id is distinct from target_user_id then
    raise exception 'Not allowed to record prompt trace for another user.'
      using errcode = '42501';
  end if;

  if safe_channel not in ('playground', 'whatsapp', 'system') then
    raise exception 'Invalid channel: %', safe_channel
      using errcode = '22023';
  end if;

  if safe_trace_type not in ('interpretation', 'transcription', 'routing', 'fallback') then
    raise exception 'Invalid trace type: %', safe_trace_type
      using errcode = '22023';
  end if;

  if safe_status not in ('success', 'error', 'skipped') then
    raise exception 'Invalid trace status: %', safe_status
      using errcode = '22023';
  end if;

  insert into public.agent_prompt_traces (
    user_id,
    channel,
    model,
    trace_type,
    status,
    action_name,
    prompt_preview,
    prompt_text,
    user_message_preview,
    response_preview,
    metadata
  )
  values (
    target_user_id,
    safe_channel,
    left(nullif(trim(coalesce(trace_model, '')), ''), 120),
    safe_trace_type,
    safe_status,
    left(nullif(trim(coalesce(action_name, '')), ''), 120),
    left(safe_prompt, 280),
    safe_prompt,
    nullif(safe_user_message, ''),
    nullif(safe_response, ''),
    coalesce(metadata, '{}'::jsonb)
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

revoke all on function public.record_agent_prompt_trace(uuid, text, text, text, text, text, text, text, text, jsonb) from public;
grant execute on function public.record_agent_prompt_trace(uuid, text, text, text, text, text, text, text, text, jsonb) to authenticated, service_role;

create or replace function public.get_admin_agent_prompts(
  search_text text default null,
  status_filter text default null,
  type_filter text default null,
  page_size integer default 50,
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
  normalized_status text := nullif(trim(coalesce(status_filter, '')), '');
  normalized_type text := nullif(trim(coalesce(type_filter, '')), '');
  safe_page_size integer := least(greatest(coalesce(page_size, 50), 1), 100);
  safe_page_offset integer := greatest(coalesce(page_offset, 0), 0);
  result jsonb;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can read agent prompt traces.'
      using errcode = '42501';
  end if;

  if normalized_status is not null and normalized_status not in ('success', 'error', 'skipped') then
    raise exception 'Invalid status filter: %', normalized_status
      using errcode = '22023';
  end if;

  if normalized_type is not null and normalized_type not in ('interpretation', 'transcription', 'routing', 'fallback') then
    raise exception 'Invalid type filter: %', normalized_type
      using errcode = '22023';
  end if;

  with enriched as (
    select
      agent_prompt_traces.*,
      profiles.full_name as user_name,
      auth_users.email as user_email
    from public.agent_prompt_traces
    left join public.profiles on profiles.id = agent_prompt_traces.user_id
    left join auth.users as auth_users on auth_users.id = agent_prompt_traces.user_id
  ),
  filtered as (
    select *
    from enriched
    where (normalized_status is null or status = normalized_status)
      and (normalized_type is null or trace_type = normalized_type)
      and (
        normalized_search = ''
        or lower(coalesce(prompt_preview, '')) like '%' || normalized_search || '%'
        or lower(coalesce(user_message_preview, '')) like '%' || normalized_search || '%'
        or lower(coalesce(response_preview, '')) like '%' || normalized_search || '%'
        or lower(coalesce(action_name, '')) like '%' || normalized_search || '%'
        or lower(coalesce(user_name, '')) like '%' || normalized_search || '%'
        or lower(coalesce(user_email, '')) like '%' || normalized_search || '%'
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
    'prompts', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', paged.id,
            'createdAt', paged.created_at,
            'userId', paged.user_id,
            'userName', paged.user_name,
            'userEmail', paged.user_email,
            'channel', paged.channel,
            'model', paged.model,
            'traceType', paged.trace_type,
            'status', paged.status,
            'actionName', paged.action_name,
            'promptPreview', paged.prompt_preview,
            'promptText', paged.prompt_text,
            'userMessagePreview', paged.user_message_preview,
            'responsePreview', paged.response_preview,
            'metadata', paged.metadata
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

revoke all on function public.get_admin_agent_prompts(text, text, text, integer, integer) from public;
grant execute on function public.get_admin_agent_prompts(text, text, text, integer, integer) to authenticated;

create or replace function public.get_admin_agent_prompt_detail(trace_id uuid)
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
    raise exception 'Only admins can read prompt details.'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', agent_prompt_traces.id,
    'createdAt', agent_prompt_traces.created_at,
    'userId', agent_prompt_traces.user_id,
    'channel', agent_prompt_traces.channel,
    'model', agent_prompt_traces.model,
    'traceType', agent_prompt_traces.trace_type,
    'status', agent_prompt_traces.status,
    'actionName', agent_prompt_traces.action_name,
    'promptText', agent_prompt_traces.prompt_text,
    'userMessagePreview', agent_prompt_traces.user_message_preview,
    'responsePreview', agent_prompt_traces.response_preview,
    'metadata', agent_prompt_traces.metadata
  )
  into result
  from public.agent_prompt_traces
  where agent_prompt_traces.id = trace_id;

  return coalesce(result, 'null'::jsonb);
end;
$$;

revoke all on function public.get_admin_agent_prompt_detail(uuid) from public;
grant execute on function public.get_admin_agent_prompt_detail(uuid) to authenticated;

create or replace function public.get_agent_runtime_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'helenaEnabled', coalesce((select value from public.app_settings where key = 'helena_enabled'), 'true'::jsonb),
    'whatsappEnabled', coalesce((select value from public.app_settings where key = 'whatsapp_enabled'), 'true'::jsonb),
    'maintenanceMode', coalesce((select value from public.app_settings where key = 'maintenance_mode'), 'false'::jsonb),
    'maxAgentMessagesPerDay', coalesce((select value from public.app_settings where key = 'max_agent_messages_per_day'), 'null'::jsonb)
  );
$$;

revoke all on function public.get_agent_runtime_settings() from public;
grant execute on function public.get_agent_runtime_settings() to anon, authenticated, service_role;

insert into public.app_settings (key, value, description)
values
  ('helena_enabled', 'true'::jsonb, 'Ativo no sistema: controla o uso da Helena no app e no WhatsApp.'),
  ('whatsapp_enabled', 'true'::jsonb, 'Ativo no sistema: controla apenas o canal WhatsApp da Helena.'),
  ('maintenance_mode', 'false'::jsonb, 'Ativo no sistema: bloqueia temporariamente a Helena para usuarios finais.'),
  ('support_email', to_jsonb(''::text), 'Informativo/futuro: e-mail de suporte salvo para uso operacional posterior.'),
  ('public_support_message', to_jsonb('Suporte FechouMEI em operacao normal.'::text), 'Informativo/futuro: mensagem publica salva para uso posterior.'),
  ('max_agent_messages_per_day', 'null'::jsonb, 'Ativo no sistema: limite diario de mensagens da Helena por usuario; vazio ou 0 significa sem limite.')
on conflict (key) do update
set description = excluded.description;

create or replace function public.get_admin_helena_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  users_total bigint := 0;
  linked_users bigint := 0;
  total_messages bigint := 0;
  recent_errors bigint := 0;
  connections jsonb := '[]'::jsonb;
  events jsonb := '[]'::jsonb;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can read Helena metrics.'
      using errcode = '42501';
  end if;

  select count(*) into users_total from public.profiles;

  select count(distinct user_id)
  into linked_users
  from public.whatsapp_assistant_links
  where status = 'linked';

  select count(*) into total_messages from public.agent_messages;

  select count(*)
  into recent_errors
  from (
    select id
    from public.agent_action_events
    where created_at >= now() - interval '7 days'
      and (status = 'failed' or error is not null)
    union all
    select id
    from public.agent_channel_events
    where created_at >= now() - interval '7 days'
      and (status = 'failed' or error is not null)
  ) as errors;

  with message_counts as (
    select user_id, count(*) as total, max(created_at) as last_message_at
    from public.agent_messages
    group by user_id
  ),
  error_counts as (
    select user_id, count(*) as total, max(created_at) as last_error_at
    from (
      select user_id, created_at
      from public.agent_action_events
      where status = 'failed' or error is not null
      union all
      select user_id, created_at
      from public.agent_channel_events
      where status = 'failed' or error is not null
    ) as raw_errors
    where user_id is not null
    group by user_id
  ),
  ordered_connections as (
    select
      profiles.id,
      profiles.full_name,
      auth_users.email,
      coalesce(whatsapp.status, 'none') as whatsapp_status,
      public.mask_admin_phone(whatsapp.phone_number) as masked_phone,
      whatsapp.linked_at,
      whatsapp.last_inbound_at,
      coalesce(message_counts.total, 0) as messages_count,
      coalesce(error_counts.total, 0) as errors_count,
      greatest(
        profiles.updated_at,
        coalesce(whatsapp.last_inbound_at, profiles.updated_at),
        coalesce(message_counts.last_message_at, profiles.updated_at),
        coalesce(error_counts.last_error_at, profiles.updated_at)
      ) as last_activity_at
    from public.profiles
    left join auth.users as auth_users on auth_users.id = profiles.id
    left join public.whatsapp_assistant_links as whatsapp on whatsapp.user_id = profiles.id
    left join message_counts on message_counts.user_id = profiles.id
    left join error_counts on error_counts.user_id = profiles.id
    order by last_activity_at desc
    limit 50
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'userId', id,
        'fullName', full_name,
        'email', email,
        'whatsappStatus', whatsapp_status,
        'maskedPhone', masked_phone,
        'linkedAt', linked_at,
        'lastInboundAt', last_inbound_at,
        'lastActivityAt', last_activity_at,
        'messagesCount', messages_count,
        'errorsCount', errors_count
      )
      order by last_activity_at desc
    ),
    '[]'::jsonb
  )
  into connections
  from ordered_connections;

  with raw_events as (
    select
      agent_action_events.user_id,
      'helena'::text as source,
      agent_action_events.action as event_type,
      agent_action_events.status,
      case when agent_action_events.status = 'failed' or agent_action_events.error is not null then 'error' else 'success' end as result,
      public.sanitize_admin_log_text(coalesce(agent_action_events.error, agent_action_events.summary, agent_action_events.action)) as summary,
      agent_action_events.created_at
    from public.agent_action_events
    union all
    select
      agent_channel_events.user_id,
      'whatsapp'::text as source,
      agent_channel_events.provider as event_type,
      agent_channel_events.status,
      case when agent_channel_events.status = 'failed' or agent_channel_events.error is not null then 'error' else 'success' end as result,
      public.sanitize_admin_log_text(coalesce(agent_channel_events.error, agent_channel_events.summary, agent_channel_events.status)) as summary,
      agent_channel_events.created_at
    from public.agent_channel_events
    union all
    select
      agent_prompt_traces.user_id,
      'helena'::text as source,
      'prompt_trace'::text as event_type,
      agent_prompt_traces.status,
      case when agent_prompt_traces.status = 'error' then 'error' else 'success' end as result,
      public.sanitize_admin_log_text(coalesce(agent_prompt_traces.action_name, agent_prompt_traces.trace_type)) as summary,
      agent_prompt_traces.created_at
    from public.agent_prompt_traces
  ),
  ordered_events as (
    select
      raw_events.*,
      profiles.full_name,
      auth_users.email
    from raw_events
    left join public.profiles on profiles.id = raw_events.user_id
    left join auth.users as auth_users on auth_users.id = raw_events.user_id
    order by raw_events.created_at desc
    limit 50
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'createdAt', created_at,
        'userId', user_id,
        'userName', full_name,
        'email', email,
        'source', source,
        'eventType', event_type,
        'status', status,
        'result', result,
        'summary', summary
      )
      order by created_at desc
    ),
    '[]'::jsonb
  )
  into events
  from ordered_events;

  return jsonb_build_object(
    'stats', jsonb_build_object(
      'linkedUsers', linked_users,
      'unlinkedUsers', greatest(users_total - linked_users, 0),
      'totalMessages', total_messages,
      'recentErrors', recent_errors
    ),
    'connections', connections,
    'events', events
  );
end;
$$;

revoke all on function public.get_admin_helena_dashboard() from public;
grant execute on function public.get_admin_helena_dashboard() to authenticated;
