create table if not exists public.reminder_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  das_monthly_enabled boolean not null default false,
  dasn_annual_enabled boolean not null default false,
  monthly_review_enabled boolean not null default false,
  receipts_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reminder_preferences enable row level security;

drop policy if exists "Users can view their own reminder preferences" on public.reminder_preferences;
create policy "Users can view their own reminder preferences"
on public.reminder_preferences
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own reminder preferences" on public.reminder_preferences;
create policy "Users can insert their own reminder preferences"
on public.reminder_preferences
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own reminder preferences" on public.reminder_preferences;
create policy "Users can update their own reminder preferences"
on public.reminder_preferences
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop trigger if exists set_reminder_preferences_updated_at on public.reminder_preferences;
create trigger set_reminder_preferences_updated_at
before update on public.reminder_preferences
for each row
execute function public.set_updated_at();
