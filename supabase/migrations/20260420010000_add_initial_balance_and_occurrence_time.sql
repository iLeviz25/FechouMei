alter table public.profiles
add column if not exists initial_balance numeric(12, 2) not null default 0;

alter table public.movimentacoes
add column if not exists occurred_at timestamptz;

update public.movimentacoes
set occurred_at = (occurred_on::timestamp + time '12:00') at time zone 'America/Sao_Paulo'
where occurred_at is null;

update public.movimentacoes
set
  description = upper(trim(description)),
  category = upper(trim(category))
where description <> upper(trim(description))
   or category <> upper(trim(category));

alter table public.movimentacoes
alter column occurred_at set default now();

alter table public.movimentacoes
alter column occurred_at set not null;

create index if not exists movimentacoes_user_occurred_at_idx
on public.movimentacoes (user_id, occurred_at desc);

create or replace function public.normalize_movimentacao_fields()
returns trigger
language plpgsql
as $$
begin
  new.description = upper(trim(new.description));
  new.category = upper(trim(new.category));

  if new.occurred_on is null and new.occurred_at is not null then
    new.occurred_on = (new.occurred_at at time zone 'America/Sao_Paulo')::date;
  end if;

  if new.occurred_at is null then
    new.occurred_at = (new.occurred_on::timestamp + timezone('America/Sao_Paulo', now())::time) at time zone 'America/Sao_Paulo';
  end if;

  return new;
end;
$$;

drop trigger if exists normalize_movimentacao_fields_before_write on public.movimentacoes;
create trigger normalize_movimentacao_fields_before_write
before insert or update on public.movimentacoes
for each row
execute function public.normalize_movimentacao_fields();

alter table public.profiles replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.profiles;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
