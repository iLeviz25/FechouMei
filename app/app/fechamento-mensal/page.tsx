import { Suspense } from "react";
import { RouteTransitionPending } from "@/components/app/route-transition-pending";
import { FechamentoMensalOverview } from "@/components/fechamento-mensal/fechamento-mensal-overview";
import { createClient } from "@/lib/supabase/server";

type FechamentoMensalPageProps = {
  searchParams?: Promise<{
    month?: string;
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

  const [movementsResult, previousMonthResult, balanceUntilMonthResult, profileResult] = await Promise.all([
    supabase
      .from("movimentacoes")
      .select("id, type, description, amount, occurred_on, occurred_at, category")
      .gte("occurred_on", monthStartValue)
      .lte("occurred_on", monthEndValue)
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("movimentacoes")
      .select("type, amount, occurred_on")
      .gte("occurred_on", previousMonthStartValue)
      .lte("occurred_on", previousMonthEndValue),
    supabase
      .from("movimentacoes")
      .select("type, amount, occurred_on")
      .lte("occurred_on", monthEndValue),
    supabase
      .from("profiles")
      .select("initial_balance")
      .maybeSingle(),
  ]);

  if (movementsResult.error) {
    throw new Error(`Erro ao carregar fechamento mensal: ${movementsResult.error.message}`);
  }

  if (previousMonthResult.error) {
    throw new Error(`Erro ao carregar comparacao do mes anterior: ${previousMonthResult.error.message}`);
  }

  if (balanceUntilMonthResult.error) {
    throw new Error(`Erro ao carregar saldo do fechamento: ${balanceUntilMonthResult.error.message}`);
  }

  if (profileResult.error) {
    throw new Error(`Erro ao carregar ajuste de saldo: ${profileResult.error.message}`);
  }

  const monthLabel = formatMonthLabel(selectedMonth);

  return (
    <FechamentoMensalOverview
      balanceRows={balanceUntilMonthResult.data ?? []}
      initialBalance={Number(profileResult.data?.initial_balance ?? 0)}
      monthEndValue={monthEndValue}
      monthLabel={monthLabel}
      monthStartValue={monthStartValue}
      monthValue={String(selectedMonth.getMonth() + 1).padStart(2, "0")}
      movements={movementsResult.data ?? []}
      previousMonthEndValue={previousMonthEndValue}
      previousMonthMovements={previousMonthResult.data ?? []}
      previousMonthStartValue={previousMonthStartValue}
      yearValue={String(selectedMonth.getFullYear())}
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
}: {
  monthParam?: string;
}) {
  if (!monthParam || !/^\d{4}-\d{2}$/.test(monthParam)) {
    return new Date();
  }

  const [year, month] = monthParam.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function addMonths(base: Date, delta: number) {
  return new Date(base.getFullYear(), base.getMonth() + delta, 1);
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
}
