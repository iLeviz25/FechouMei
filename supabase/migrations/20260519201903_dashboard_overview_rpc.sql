create or replace function public.get_dashboard_overview()
returns jsonb
language plpgsql
security invoker
stable
set search_path = public
as $$
declare
  target_user_id uuid := auth.uid();
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  month_start date := date_trunc('month', today)::date;
  month_end date := (date_trunc('month', today) + interval '1 month - 1 day')::date;
  previous_month_start date := (date_trunc('month', today) - interval '1 month')::date;
  previous_month_end date := (date_trunc('month', today) - interval '1 day')::date;
  year_start date := date_trunc('year', today)::date;
  year_end date := (date_trunc('year', today) + interval '1 year - 1 day')::date;
  month_key text := to_char(month_start, 'YYYY-MM');
  initial_balance numeric := 0;
  movement_balance numeric := 0;
  annual_income numeric := 0;
  monthly_income numeric := 0;
  monthly_expense numeric := 0;
  previous_month_income numeric := 0;
  previous_month_expense numeric := 0;
  checklist_done_count integer := 0;
  das_done boolean := false;
  recent_movements jsonb := '[]'::jsonb;
begin
  if target_user_id is null then
    return null;
  end if;

  select coalesce(
    (
      select profiles.initial_balance
      from public.profiles
      where profiles.id = target_user_id
    ),
    0
  )
  into initial_balance;

  select
    coalesce(sum(
      case
        when movimentacoes.type = 'entrada' then movimentacoes.amount
        when movimentacoes.type = 'despesa' then -movimentacoes.amount
        else 0
      end
    ), 0),
    coalesce(sum(movimentacoes.amount) filter (
      where movimentacoes.type = 'entrada'
        and movimentacoes.occurred_on between year_start and year_end
    ), 0),
    coalesce(sum(movimentacoes.amount) filter (
      where movimentacoes.type = 'entrada'
        and movimentacoes.occurred_on between month_start and month_end
    ), 0),
    coalesce(sum(movimentacoes.amount) filter (
      where movimentacoes.type = 'despesa'
        and movimentacoes.occurred_on between month_start and month_end
    ), 0),
    coalesce(sum(movimentacoes.amount) filter (
      where movimentacoes.type = 'entrada'
        and movimentacoes.occurred_on between previous_month_start and previous_month_end
    ), 0),
    coalesce(sum(movimentacoes.amount) filter (
      where movimentacoes.type = 'despesa'
        and movimentacoes.occurred_on between previous_month_start and previous_month_end
    ), 0)
  into
    movement_balance,
    annual_income,
    monthly_income,
    monthly_expense,
    previous_month_income,
    previous_month_expense
  from public.movimentacoes
  where movimentacoes.user_id = target_user_id;

  select
    count(*) filter (where obrigacoes_checklist.done)::integer,
    coalesce(bool_or(
      obrigacoes_checklist.item_key = 'pagar-das'
      and obrigacoes_checklist.done
    ), false)
  into checklist_done_count, das_done
  from public.obrigacoes_checklist
  where obrigacoes_checklist.user_id = target_user_id
    and obrigacoes_checklist.month = month_key;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', recent.id,
        'type', recent.type,
        'description', recent.description,
        'amount', recent.amount,
        'occurred_on', recent.occurred_on,
        'occurred_at', recent.occurred_at,
        'category', recent.category
      )
      order by recent.occurred_at desc, recent.created_at desc
    ),
    '[]'::jsonb
  )
  into recent_movements
  from (
    select
      movimentacoes.id,
      movimentacoes.type,
      movimentacoes.description,
      movimentacoes.amount,
      movimentacoes.occurred_on,
      movimentacoes.occurred_at,
      movimentacoes.category,
      movimentacoes.created_at
    from public.movimentacoes
    where movimentacoes.user_id = target_user_id
    order by movimentacoes.occurred_at desc, movimentacoes.created_at desc
    limit 6
  ) as recent;

  return jsonb_build_object(
    'annualIncome', annual_income,
    'monthlyIncome', monthly_income,
    'monthlyExpense', monthly_expense,
    'previousMonthIncome', previous_month_income,
    'previousMonthExpense', previous_month_expense,
    'currentBalance', initial_balance + movement_balance,
    'checklistDoneCount', checklist_done_count,
    'dasDone', das_done,
    'recentMovements', recent_movements
  );
end;
$$;

revoke all on function public.get_dashboard_overview() from public;
grant execute on function public.get_dashboard_overview() to authenticated;
