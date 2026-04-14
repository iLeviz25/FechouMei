create table if not exists public.obrigacoes_checklist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  item_key text not null,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month, item_key)
);

create index if not exists obrigacoes_checklist_user_month_idx
on public.obrigacoes_checklist (user_id, month);

alter table public.obrigacoes_checklist enable row level security;

drop policy if exists "Users can view their own checklist" on public.obrigacoes_checklist;
create policy "Users can view their own checklist"
on public.obrigacoes_checklist
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own checklist" on public.obrigacoes_checklist;
create policy "Users can insert their own checklist"
on public.obrigacoes_checklist
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own checklist" on public.obrigacoes_checklist;
create policy "Users can update their own checklist"
on public.obrigacoes_checklist
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own checklist" on public.obrigacoes_checklist;
create policy "Users can delete their own checklist"
on public.obrigacoes_checklist
for delete
to authenticated
using (auth.uid() = user_id);

drop trigger if exists set_obrigacoes_checklist_updated_at on public.obrigacoes_checklist;
create trigger set_obrigacoes_checklist_updated_at
before update on public.obrigacoes_checklist
for each row
execute function public.set_updated_at();
