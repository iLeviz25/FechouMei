create table if not exists public.movimentacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('entrada', 'despesa')),
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),
  occurred_on date not null default current_date,
  category text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists movimentacoes_user_date_idx
on public.movimentacoes (user_id, occurred_on desc);

alter table public.movimentacoes enable row level security;

drop policy if exists "Users can view their own movements" on public.movimentacoes;
create policy "Users can view their own movements"
on public.movimentacoes
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own movements" on public.movimentacoes;
create policy "Users can insert their own movements"
on public.movimentacoes
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own movements" on public.movimentacoes;
create policy "Users can update their own movements"
on public.movimentacoes
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own movements" on public.movimentacoes;
create policy "Users can delete their own movements"
on public.movimentacoes
for delete
to authenticated
using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_movimentacoes_updated_at on public.movimentacoes;
create trigger set_movimentacoes_updated_at
before update on public.movimentacoes
for each row
execute function public.set_updated_at();
