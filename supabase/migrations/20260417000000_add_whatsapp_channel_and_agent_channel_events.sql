alter table public.agent_conversations
drop constraint if exists agent_conversations_channel_check;

alter table public.agent_conversations
add constraint agent_conversations_channel_check
check (channel in ('playground', 'whatsapp'));

create table if not exists public.agent_channel_events (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('whatsapp')),
  direction text not null default 'inbound' check (direction in ('inbound')),
  provider text not null default 'evolution',
  external_message_id text not null,
  provider_instance text,
  remote_id text,
  user_id uuid references auth.users(id) on delete cascade,
  conversation_id uuid references public.agent_conversations(id) on delete set null,
  status text not null check (status in ('received', 'processed', 'discarded', 'failed')),
  summary text,
  error text,
  message_text text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create unique index if not exists agent_channel_events_channel_direction_external_idx
on public.agent_channel_events (channel, direction, external_message_id);

create index if not exists agent_channel_events_user_created_idx
on public.agent_channel_events (user_id, created_at desc);

create index if not exists agent_channel_events_status_created_idx
on public.agent_channel_events (status, created_at desc);

alter table public.agent_channel_events enable row level security;

drop policy if exists "Users can view their own agent channel events" on public.agent_channel_events;
create policy "Users can view their own agent channel events"
on public.agent_channel_events
for select
to authenticated
using (auth.uid() = user_id);
