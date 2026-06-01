create table if not exists public.import_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'whatsapp' check (source in ('whatsapp', 'upload')),
  file_name text,
  file_type text,
  status text not null default 'draft' check (status in ('draft', 'reviewed', 'imported', 'expired', 'failed', 'cancelled')),
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '48 hours')
);

create table if not exists public.import_session_rows (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.import_sessions(id) on delete cascade,
  row_index integer not null,
  raw_data jsonb not null default '{}'::jsonb,
  normalized_data jsonb not null default '{}'::jsonb,
  status text not null check (status in ('valid', 'error', 'duplicate', 'duplicate_file', 'duplicate_existing')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists import_sessions_user_created_idx
on public.import_sessions (user_id, created_at desc);

create index if not exists import_sessions_status_expires_idx
on public.import_sessions (status, expires_at);

create index if not exists import_session_rows_session_idx
on public.import_session_rows (session_id, row_index);

alter table public.import_sessions enable row level security;
alter table public.import_session_rows enable row level security;

drop trigger if exists set_import_sessions_updated_at on public.import_sessions;
create trigger set_import_sessions_updated_at
before update on public.import_sessions
for each row
execute function public.set_updated_at();

drop policy if exists "Users can view their own import sessions" on public.import_sessions;
create policy "Users can view their own import sessions"
on public.import_sessions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can update their own import sessions" on public.import_sessions;
create policy "Users can update their own import sessions"
on public.import_sessions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Admins can view import sessions" on public.import_sessions;
create policy "Admins can view import sessions"
on public.import_sessions
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "Users can view their own import session rows" on public.import_session_rows;
create policy "Users can view their own import session rows"
on public.import_session_rows
for select
to authenticated
using (
  exists (
    select 1
    from public.import_sessions sessions
    where sessions.id = import_session_rows.session_id
      and sessions.user_id = auth.uid()
  )
);

drop policy if exists "Admins can view import session rows" on public.import_session_rows;
create policy "Admins can view import session rows"
on public.import_session_rows
for select
to authenticated
using (public.is_admin(auth.uid()));
