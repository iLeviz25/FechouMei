create table if not exists public.agent_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null default 'playground' check (channel in ('playground')),
  status text not null default 'idle' check (status in ('idle', 'collecting', 'awaiting_confirmation')),
  pending_action text,
  draft jsonb not null default '{}'::jsonb,
  missing_fields text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, channel)
);

create index if not exists agent_conversations_user_channel_idx
on public.agent_conversations (user_id, channel);

alter table public.agent_conversations enable row level security;

drop policy if exists "Users can view their own agent conversations" on public.agent_conversations;
create policy "Users can view their own agent conversations"
on public.agent_conversations
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own agent conversations" on public.agent_conversations;
create policy "Users can insert their own agent conversations"
on public.agent_conversations
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own agent conversations" on public.agent_conversations;
create policy "Users can update their own agent conversations"
on public.agent_conversations
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own agent conversations" on public.agent_conversations;
create policy "Users can delete their own agent conversations"
on public.agent_conversations
for delete
to authenticated
using (auth.uid() = user_id);

drop trigger if exists set_agent_conversations_updated_at on public.agent_conversations;
create trigger set_agent_conversations_updated_at
before update on public.agent_conversations
for each row
execute function public.set_updated_at();

create table if not exists public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.agent_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'agent')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists agent_messages_conversation_created_idx
on public.agent_messages (conversation_id, created_at);

create index if not exists agent_messages_user_created_idx
on public.agent_messages (user_id, created_at desc);

alter table public.agent_messages enable row level security;

drop policy if exists "Users can view their own agent messages" on public.agent_messages;
create policy "Users can view their own agent messages"
on public.agent_messages
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own agent messages" on public.agent_messages;
create policy "Users can insert their own agent messages"
on public.agent_messages
for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.agent_conversations
    where agent_conversations.id = agent_messages.conversation_id
      and agent_conversations.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete their own agent messages" on public.agent_messages;
create policy "Users can delete their own agent messages"
on public.agent_messages
for delete
to authenticated
using (auth.uid() = user_id);
