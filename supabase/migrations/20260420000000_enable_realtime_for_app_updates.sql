alter table public.movimentacoes replica identity full;
alter table public.obrigacoes_checklist replica identity full;
alter table public.reminder_preferences replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.movimentacoes;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.obrigacoes_checklist;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.reminder_preferences;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
