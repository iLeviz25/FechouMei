create or replace function public.mask_admin_phone(phone_value text)
returns text
language sql
immutable
security definer
set search_path = public
as $$
  with cleaned as (
    select regexp_replace(coalesce(phone_value, ''), '\D', '', 'g') as digits
  )
  select case
    when length(digits) < 4 then null
    when left(digits, 2) = '55' then '+55 ** *****-' || right(digits, 4)
    else '+** ** *****-' || right(digits, 4)
  end
  from cleaned;
$$;

revoke all on function public.mask_admin_phone(text) from public;

create or replace function public.sanitize_admin_log_text(input_text text)
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

  return left(sanitized, 280);
end;
$$;

revoke all on function public.sanitize_admin_log_text(text) from public;

create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  origin text not null default 'admin' check (origin in ('admin', 'helena', 'whatsapp', 'auth', 'app', 'supabase', 'sistema')),
  severity text not null default 'info' check (severity in ('info', 'warning', 'error', 'critical')),
  event_type text not null,
  status text not null default 'recorded',
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_events_created_idx
on public.admin_audit_events (created_at desc);

create index if not exists admin_audit_events_origin_severity_idx
on public.admin_audit_events (origin, severity, created_at desc);

alter table public.admin_audit_events enable row level security;

drop policy if exists "Admins can view audit events" on public.admin_audit_events;
create policy "Admins can view audit events"
on public.admin_audit_events
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "Admins can insert audit events" on public.admin_audit_events;
create policy "Admins can insert audit events"
on public.admin_audit_events
for insert
to authenticated
with check (public.is_admin(auth.uid()));

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default 'null'::jsonb,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.app_settings enable row level security;

drop policy if exists "Admins can view app settings" on public.app_settings;
create policy "Admins can view app settings"
on public.app_settings
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "Admins can update app settings" on public.app_settings;
create policy "Admins can update app settings"
on public.app_settings
for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can insert app settings" on public.app_settings;
create policy "Admins can insert app settings"
on public.app_settings
for insert
to authenticated
with check (public.is_admin(auth.uid()));

insert into public.app_settings (key, value, description)
values
  ('helena_enabled', 'true'::jsonb, 'Habilita a Helena para uso operacional futuro.'),
  ('whatsapp_enabled', 'true'::jsonb, 'Habilita o canal WhatsApp para uso operacional futuro.'),
  ('maintenance_mode', 'false'::jsonb, 'Sinalizador interno de modo manutencao.'),
  ('support_email', to_jsonb(''::text), 'E-mail interno de suporte.'),
  ('public_support_message', to_jsonb('Suporte FechouMEI em operacao normal.'::text), 'Mensagem curta de suporte.'),
  ('max_agent_messages_per_day', 'null'::jsonb, 'Limite futuro de mensagens diarias da Helena.')
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
    limit 20
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

create or replace function public.get_admin_logs(
  search_text text default null,
  severity_filter text default null,
  origin_filter text default null,
  period_filter text default '7d',
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
  normalized_severity text := nullif(trim(coalesce(severity_filter, '')), '');
  normalized_origin text := nullif(trim(coalesce(origin_filter, '')), '');
  normalized_period text := coalesce(nullif(trim(coalesce(period_filter, '')), ''), '7d');
  safe_page_size integer := least(greatest(coalesce(page_size, 50), 1), 100);
  safe_page_offset integer := greatest(coalesce(page_offset, 0), 0);
  period_start timestamptz;
  result jsonb;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can read logs.'
      using errcode = '42501';
  end if;

  if normalized_severity is not null and normalized_severity not in ('info', 'warning', 'error', 'critical') then
    raise exception 'Invalid severity filter: %', normalized_severity
      using errcode = '22023';
  end if;

  if normalized_origin is not null and normalized_origin not in ('helena', 'whatsapp', 'auth', 'app', 'supabase', 'sistema', 'admin') then
    raise exception 'Invalid origin filter: %', normalized_origin
      using errcode = '22023';
  end if;

  period_start := case normalized_period
    when '24h' then now() - interval '24 hours'
    when '30d' then now() - interval '30 days'
    else now() - interval '7 days'
  end;

  with raw_logs as (
    select
      agent_action_events.id::text as id,
      agent_action_events.created_at,
      'helena'::text as origin,
      case
        when agent_action_events.status = 'failed' or agent_action_events.error is not null then 'error'
        when agent_action_events.status = 'cancelled' then 'warning'
        else 'info'
      end as severity,
      agent_action_events.user_id,
      agent_action_events.action as message,
      agent_action_events.status,
      public.sanitize_admin_log_text(coalesce(agent_action_events.error, agent_action_events.summary)) as detail
    from public.agent_action_events
    union all
    select
      agent_channel_events.id::text as id,
      agent_channel_events.created_at,
      'whatsapp'::text as origin,
      case
        when agent_channel_events.status = 'failed' or agent_channel_events.error is not null then 'error'
        when agent_channel_events.status = 'discarded' then 'warning'
        else 'info'
      end as severity,
      agent_channel_events.user_id,
      agent_channel_events.provider as message,
      agent_channel_events.status,
      public.sanitize_admin_log_text(coalesce(agent_channel_events.error, agent_channel_events.summary)) as detail
    from public.agent_channel_events
    union all
    select
      admin_audit_events.id::text as id,
      admin_audit_events.created_at,
      admin_audit_events.origin,
      admin_audit_events.severity,
      coalesce(admin_audit_events.target_user_id, admin_audit_events.actor_id) as user_id,
      admin_audit_events.event_type as message,
      admin_audit_events.status,
      public.sanitize_admin_log_text(admin_audit_events.message) as detail
    from public.admin_audit_events
  ),
  enriched as (
    select
      raw_logs.*,
      profiles.full_name as user_name,
      auth_users.email as user_email
    from raw_logs
    left join public.profiles on profiles.id = raw_logs.user_id
    left join auth.users as auth_users on auth_users.id = raw_logs.user_id
  ),
  filtered as (
    select *
    from enriched
    where created_at >= period_start
      and (normalized_severity is null or severity = normalized_severity)
      and (normalized_origin is null or origin = normalized_origin)
      and (
        normalized_search = ''
        or lower(coalesce(message, '')) like '%' || normalized_search || '%'
        or lower(coalesce(detail, '')) like '%' || normalized_search || '%'
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
  ),
  latest_error as (
    select *
    from enriched
    where severity in ('error', 'critical')
    order by created_at desc
    limit 1
  )
  select jsonb_build_object(
    'metrics', jsonb_build_object(
      'errorsLast24Hours', (
        select count(*) from enriched
        where created_at >= now() - interval '24 hours'
          and severity in ('error', 'critical')
      ),
      'errorsLast7Days', (
        select count(*) from enriched
        where created_at >= now() - interval '7 days'
          and severity in ('error', 'critical')
      ),
      'criticalEvents', (
        select count(*) from enriched
        where created_at >= period_start
          and severity = 'critical'
      ),
      'latestError', (
        select coalesce(
          jsonb_build_object(
            'createdAt', latest_error.created_at,
            'origin', latest_error.origin,
            'severity', latest_error.severity,
            'message', latest_error.message,
            'detail', latest_error.detail,
            'status', latest_error.status
          ),
          'null'::jsonb
        )
        from latest_error
      )
    ),
    'total', (select count(*) from filtered),
    'pageSize', safe_page_size,
    'pageOffset', safe_page_offset,
    'logs', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', paged.id,
            'createdAt', paged.created_at,
            'origin', paged.origin,
            'severity', paged.severity,
            'userId', paged.user_id,
            'userName', paged.user_name,
            'userEmail', paged.user_email,
            'message', paged.message,
            'status', paged.status,
            'detail', paged.detail
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

revoke all on function public.get_admin_logs(text, text, text, text, integer, integer) from public;
grant execute on function public.get_admin_logs(text, text, text, text, integer, integer) to authenticated;

create or replace function public.get_admin_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not public.is_admin(auth.uid()) then
      jsonb_build_object('error', 'Only admins can read settings.')
    else
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'key', app_settings.key,
            'value', app_settings.value,
            'description', app_settings.description,
            'updatedAt', app_settings.updated_at,
            'updatedBy', app_settings.updated_by
          )
          order by app_settings.key
        ),
        '[]'::jsonb
      )
  end
  from public.app_settings;
$$;

revoke all on function public.get_admin_settings() from public;
grant execute on function public.get_admin_settings() to authenticated;

create or replace function public.update_admin_setting(setting_key text, setting_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  normalized_key text := trim(coalesce(setting_key, ''));
  normalized_value jsonb := coalesce(setting_value, 'null'::jsonb);
  setting_description text;
  numeric_value numeric;
  updated_row public.app_settings;
begin
  if not public.is_admin(actor_id) then
    raise exception 'Only admins can update settings.'
      using errcode = '42501';
  end if;

  setting_description := case normalized_key
    when 'helena_enabled' then 'Habilita a Helena para uso operacional futuro.'
    when 'whatsapp_enabled' then 'Habilita o canal WhatsApp para uso operacional futuro.'
    when 'maintenance_mode' then 'Sinalizador interno de modo manutencao.'
    when 'support_email' then 'E-mail interno de suporte.'
    when 'public_support_message' then 'Mensagem curta de suporte.'
    when 'max_agent_messages_per_day' then 'Limite futuro de mensagens diarias da Helena.'
    else null
  end;

  if setting_description is null then
    raise exception 'Unknown setting key: %', normalized_key
      using errcode = '22023';
  end if;

  if normalized_key in ('helena_enabled', 'whatsapp_enabled', 'maintenance_mode') then
    if jsonb_typeof(normalized_value) <> 'boolean' then
      raise exception 'Setting % must be boolean.', normalized_key
        using errcode = '22023';
    end if;
  elsif normalized_key in ('support_email', 'public_support_message') then
    if jsonb_typeof(normalized_value) <> 'string' then
      raise exception 'Setting % must be string.', normalized_key
        using errcode = '22023';
    end if;

    if normalized_key = 'public_support_message' and length(normalized_value #>> '{}') > 500 then
      raise exception 'public_support_message must be at most 500 characters.'
        using errcode = '22023';
    end if;
  elsif normalized_key = 'max_agent_messages_per_day' then
    if jsonb_typeof(normalized_value) not in ('number', 'null') then
      raise exception 'max_agent_messages_per_day must be a number or null.'
        using errcode = '22023';
    end if;

    if jsonb_typeof(normalized_value) = 'number' then
      numeric_value := (normalized_value #>> '{}')::numeric;
      if numeric_value < 0 or numeric_value > 100000 or numeric_value <> floor(numeric_value) then
        raise exception 'max_agent_messages_per_day must be an integer from 0 to 100000.'
          using errcode = '22023';
      end if;
    end if;
  end if;

  insert into public.app_settings (key, value, description, updated_at, updated_by)
  values (normalized_key, normalized_value, setting_description, now(), actor_id)
  on conflict (key) do update
  set value = excluded.value,
      description = excluded.description,
      updated_at = now(),
      updated_by = actor_id
  returning * into updated_row;

  insert into public.admin_audit_events (
    actor_id,
    origin,
    severity,
    event_type,
    status,
    message,
    metadata
  )
  values (
    actor_id,
    'admin',
    'info',
    'setting_updated',
    'success',
    'Admin setting updated: ' || normalized_key,
    jsonb_build_object('key', normalized_key)
  );

  return jsonb_build_object(
    'key', updated_row.key,
    'value', updated_row.value,
    'description', updated_row.description,
    'updatedAt', updated_row.updated_at,
    'updatedBy', updated_row.updated_by
  );
end;
$$;

revoke all on function public.update_admin_setting(text, jsonb) from public;
grant execute on function public.update_admin_setting(text, jsonb) to authenticated;
