create table if not exists public.agent_action_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.agent_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  status text not null check (status in ('collecting', 'confirmation_requested', 'executed', 'cancelled', 'failed')),
  confirmation text check (confirmation in ('not_required', 'requested', 'confirmed', 'cancelled')),
  summary text,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists agent_action_events_conversation_created_idx
on public.agent_action_events (conversation_id, created_at desc);

create index if not exists agent_action_events_user_created_idx
on public.agent_action_events (user_id, created_at desc);

alter table public.agent_action_events enable row level security;

drop policy if exists "Users can view their own agent action events" on public.agent_action_events;
create policy "Users can view their own agent action events"
on public.agent_action_events
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own agent action events" on public.agent_action_events;
create policy "Users can insert their own agent action events"
on public.agent_action_events
for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.agent_conversations
    where agent_conversations.id = agent_action_events.conversation_id
      and agent_conversations.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete their own agent action events" on public.agent_action_events;
create policy "Users can delete their own agent action events"
on public.agent_action_events
for delete
to authenticated
using (auth.uid() = user_id);
