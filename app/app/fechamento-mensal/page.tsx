import { Suspense } from "react";
import { RouteTransitionPending } from "@/components/app/route-transition-pending";
import { FechamentoMensalOverview } from "@/components/fechamento-mensal/fechamento-mensal-overview";
import { createClient } from "@/lib/supabase/server";

type FechamentoMensalPageProps = {
  searchParams?: Promise<{
    month?: string;
    monthValue?: string;
    year?: string;
  }>;
};

export default function FechamentoMensalPage({ searchParams }: FechamentoMensalPageProps) {
  return (
    <Suspense fallback={<RouteTransitionPending label="Carregando fechamento mensal" />}>
      <FechamentoMensalData searchParams={searchParams} />
    </Suspense>
  );
}

async function FechamentoMensalData({ searchParams }: FechamentoMensalPageProps) {
  const supabase = await createClient();
  const resolvedSearchParams = await searchParams;
  const selectedMonth = resolveMonth({
    monthParam: resolvedSearchParams?.month,
    monthValue: resolvedSearchParams?.monthValue,
    yearValue: resolvedSearchParams?.year,
  });
  const monthStart = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
  const monthEnd = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0);
  const previousMonth = addMonths(selectedMonth, -1);
  const previousMonthStart = new Date(previousMonth.getFullYear(), previousMonth.getMonth(), 1);
  const previousMonthEnd = new Date(previousMonth.getFullYear(), previousMonth.getMonth() + 1, 0);

  const monthStartValue = toDateInputValue(monthStart);
  const monthEndValue = toDateInputValue(monthEnd);
  const previousMonthStartValue = toDateInputValue(previousMonthStart);
  const previousMonthEndValue = toDateInputValue(previousMonthEnd);

  const [movementsResult, previousMonthResult] = await Promise.all([
    supabase
      .from("movimentacoes")
      .select("id, type, description, amount, occurred_on, category")
      .gte("occurred_on", monthStartValue)
      .lte("occurred_on", monthEndValue)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("movimentacoes")
      .select("type, amount")
      .gte("occurred_on", previousMonthStartValue)
      .lte("occurred_on", previousMonthEndValue),
  ]);

  if (movementsResult.error) {
    throw new Error(`Erro ao carregar fechamento mensal: ${movementsResult.error.message}`);
  }

  if (previousMonthResult.error) {
    throw new Error(`Erro ao carregar comparação do mês anterior: ${previousMonthResult.error.message}`);
  }

  const movements = movementsResult.data ?? [];
  const totals = movements.reduce(
    (acc, movement) => {
      if (movement.type === "entrada") {
        acc.monthlyIncome += movement.amount;
      } else {
        acc.monthlyExpense += movement.amount;
      }
      return acc;
    },
    { monthlyExpense: 0, monthlyIncome: 0 },
  );

  const previousTotals = (previousMonthResult.data ?? []).reduce(
    (acc, movement) => {
      if (movement.type === "entrada") {
        acc.monthlyIncome += movement.amount;
      } else {
        acc.monthlyExpense += movement.amount;
      }
      return acc;
    },
    { monthlyExpense: 0, monthlyIncome: 0 },
  );

  const monthLabel = formatMonthLabel(selectedMonth);
  const nextMonth = addMonths(selectedMonth, 1);

  return (
    <FechamentoMensalOverview
      monthLabel={monthLabel}
      monthValue={String(selectedMonth.getMonth() + 1).padStart(2, "0")}
      yearValue={String(selectedMonth.getFullYear())}
      monthlyExpense={totals.monthlyExpense}
      monthlyIncome={totals.monthlyIncome}
      previousMonthlyExpense={previousTotals.monthlyExpense}
      previousMonthlyIncome={previousTotals.monthlyIncome}
      movements={movements}
      nextHref={buildMonthHref(nextMonth)}
      previousHref={buildMonthHref(previousMonth)}
    />
  );
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveMonth({
  monthParam,
  monthValue,
  yearValue,
}: {
  monthParam?: string;
  monthValue?: string;
  yearValue?: string;
}) {
  if (monthValue && yearValue && /^\d{2}$/.test(monthValue) && /^\d{4}$/.test(yearValue)) {
    return new Date(Number(yearValue), Number(monthValue) - 1, 1);
  }

  if (!monthParam || !/^\d{4}-\d{2}$/.test(monthParam)) {
    return new Date();
  }

  const [year, month] = monthParam.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function addMonths(base: Date, delta: number) {
  return new Date(base.getFullYear(), base.getMonth() + delta, 1);
}

function buildMonthHref(date: Date) {
  const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  return `/app/fechamento-mensal?month=${value}`;
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
}
