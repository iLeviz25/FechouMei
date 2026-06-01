create or replace function public.claim_agent_turn(
  queue_item_id uuid,
  lock_ttl_seconds integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.agent_turn_queue%rowtype;
  head_id uuid;
  requested_token uuid := gen_random_uuid();
  claimed_token uuid;
  safe_lock_ttl_seconds integer := least(greatest(coalesce(lock_ttl_seconds, 90), 30), 300);
begin
  select q.*
  into item
  from public.agent_turn_queue as q
  where q.id = claim_agent_turn.queue_item_id
  for update;

  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'missing_queue_item');
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_admin(auth.uid())
     and auth.uid() is distinct from item.user_id then
    raise exception 'Not allowed to claim agent turn for another user.'
      using errcode = '42501';
  end if;

  update public.agent_turn_queue as q
  set status = 'expired',
      finished_at = now(),
      error = coalesce(q.error, 'Turn expired before processing.')
  where q.user_id = item.user_id
    and q.channel = item.channel
    and q.status in ('waiting', 'processing')
    and q.expires_at <= now();

  delete from public.agent_conversation_locks as l
  where l.user_id = item.user_id
    and l.channel = item.channel
    and l.expires_at <= now();

  select q.*
  into item
  from public.agent_turn_queue as q
  where q.id = claim_agent_turn.queue_item_id
  for update;

  if item.status <> 'waiting' then
    return jsonb_build_object('claimed', false, 'reason', item.status);
  end if;

  select q.id
  into head_id
  from public.agent_turn_queue as q
  where q.user_id = item.user_id
    and q.channel = item.channel
    and q.status = 'waiting'
  order by q.position asc
  limit 1;

  if head_id is distinct from claim_agent_turn.queue_item_id then
    return jsonb_build_object('claimed', false, 'reason', 'not_queue_head');
  end if;

  insert into public.agent_conversation_locks (
    user_id,
    channel,
    queue_item_id,
    lock_token,
    acquired_at,
    expires_at
  )
  values (
    item.user_id,
    item.channel,
    item.id,
    requested_token,
    now(),
    now() + make_interval(secs => safe_lock_ttl_seconds)
  )
  on conflict (user_id, channel) do update
  set queue_item_id = excluded.queue_item_id,
      lock_token = excluded.lock_token,
      acquired_at = excluded.acquired_at,
      expires_at = excluded.expires_at
  where public.agent_conversation_locks.expires_at <= now()
  returning lock_token into claimed_token;

  if claimed_token is null then
    return jsonb_build_object('claimed', false, 'reason', 'conversation_locked');
  end if;

  update public.agent_turn_queue as q
  set status = 'processing',
      lock_token = claimed_token,
      started_at = now(),
      expires_at = now() + make_interval(secs => safe_lock_ttl_seconds)
  where q.id = claim_agent_turn.queue_item_id;

  return jsonb_build_object(
    'claimed', true,
    'lockToken', claimed_token
  );
end;
$$;

revoke all on function public.claim_agent_turn(uuid, integer) from public;
grant execute on function public.claim_agent_turn(uuid, integer) to authenticated, service_role;

create or replace function public.extend_agent_turn_lock(
  queue_item_id uuid,
  provided_lock_token uuid,
  lock_ttl_seconds integer default 90
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.agent_turn_queue%rowtype;
  renewed_expires_at timestamptz;
  safe_lock_ttl_seconds integer := least(greatest(coalesce(lock_ttl_seconds, 90), 30), 300);
begin
  select q.*
  into item
  from public.agent_turn_queue as q
  where q.id = extend_agent_turn_lock.queue_item_id
  for update;

  if not found then
    return false;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_admin(auth.uid())
     and auth.uid() is distinct from item.user_id then
    raise exception 'Not allowed to extend agent turn for another user.'
      using errcode = '42501';
  end if;

  if item.status <> 'processing' or item.lock_token is distinct from extend_agent_turn_lock.provided_lock_token then
    return false;
  end if;

  renewed_expires_at := now() + make_interval(secs => safe_lock_ttl_seconds);

  update public.agent_conversation_locks as l
  set expires_at = renewed_expires_at
  where l.user_id = item.user_id
    and l.channel = item.channel
    and l.queue_item_id = item.id
    and l.lock_token = extend_agent_turn_lock.provided_lock_token;

  if not found then
    return false;
  end if;

  update public.agent_turn_queue as q
  set expires_at = renewed_expires_at
  where q.id = extend_agent_turn_lock.queue_item_id;

  return true;
end;
$$;

revoke all on function public.extend_agent_turn_lock(uuid, uuid, integer) from public;
grant execute on function public.extend_agent_turn_lock(uuid, uuid, integer) to authenticated, service_role;

create or replace function public.finish_agent_turn(
  queue_item_id uuid,
  provided_lock_token uuid,
  final_status text default 'completed',
  error_text text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.agent_turn_queue%rowtype;
begin
  if final_status not in ('completed', 'failed') then
    raise exception 'Invalid final status: %', final_status
      using errcode = '22023';
  end if;

  select q.*
  into item
  from public.agent_turn_queue as q
  where q.id = finish_agent_turn.queue_item_id
  for update;

  if not found then
    return false;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_admin(auth.uid())
     and auth.uid() is distinct from item.user_id then
    raise exception 'Not allowed to finish agent turn for another user.'
      using errcode = '42501';
  end if;

  if item.status <> 'processing' or item.lock_token is distinct from finish_agent_turn.provided_lock_token then
    return false;
  end if;

  update public.agent_turn_queue as q
  set status = finish_agent_turn.final_status,
      finished_at = now(),
      error = finish_agent_turn.error_text
  where q.id = finish_agent_turn.queue_item_id;

  delete from public.agent_conversation_locks as l
  where l.user_id = item.user_id
    and l.channel = item.channel
    and l.queue_item_id = item.id
    and l.lock_token = finish_agent_turn.provided_lock_token;

  return true;
end;
$$;

revoke all on function public.finish_agent_turn(uuid, uuid, text, text) from public;
grant execute on function public.finish_agent_turn(uuid, uuid, text, text) to authenticated, service_role;

create or replace function public.abandon_agent_turn(
  queue_item_id uuid,
  error_text text default 'Turn abandoned before processing.'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.agent_turn_queue%rowtype;
begin
  select q.*
  into item
  from public.agent_turn_queue as q
  where q.id = abandon_agent_turn.queue_item_id
  for update;

  if not found then
    return false;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_admin(auth.uid())
     and auth.uid() is distinct from item.user_id then
    raise exception 'Not allowed to abandon agent turn for another user.'
      using errcode = '42501';
  end if;

  if item.status <> 'waiting' then
    return false;
  end if;

  update public.agent_turn_queue as q
  set status = 'abandoned',
      finished_at = now(),
      error = left(coalesce(abandon_agent_turn.error_text, 'Turn abandoned before processing.'), 240)
  where q.id = abandon_agent_turn.queue_item_id;

  return true;
end;
$$;

revoke all on function public.abandon_agent_turn(uuid, text) from public;
grant execute on function public.abandon_agent_turn(uuid, text) to authenticated, service_role;
