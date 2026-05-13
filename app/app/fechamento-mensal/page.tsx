import { Suspense } from "react";
import { RouteTransitionPending } from "@/components/app/route-transition-pending";
import { FechamentoMensalOverview } from "@/components/fechamento-mensal/fechamento-mensal-overview";
import { getCurrentUserProfile } from "@/lib/profile";

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
  const { profile, profileError, supabase, user } = await getCurrentUserProfile();

  if (!user) {
    throw new Error("Faça login para ver o fechamento mensal.");
  }

  const resolvedSearchParams = await searchParams;
  const selectedMonth = resolveMonth({
    monthParam: resolvedSearchParams?.month,
  });
  const monthStart = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
  const monthEnd = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0);
  const previousMonth = addMonths(selectedMonth, -1);
  const trendStart = addMonths(selectedMonth, -5);
  const interactiveWindowStart = addMonths(selectedMonth, -10);
  const interactiveWindowEnd = addMonths(selectedMonth, 6);
  const previousMonthStart = new Date(previousMonth.getFullYear(), previousMonth.getMonth(), 1);
  const previousMonthEnd = new Date(previousMonth.getFullYear(), previousMonth.getMonth() + 1, 0);
  const trendStartDate = new Date(trendStart.getFullYear(), trendStart.getMonth(), 1);
  const interactiveWindowStartDate = new Date(interactiveWindowStart.getFullYear(), interactiveWindowStart.getMonth(), 1);
  const interactiveWindowEndDate = new Date(interactiveWindowEnd.getFullYear(), interactiveWindowEnd.getMonth() + 1, 0);

  const monthStartValue = toDateInputValue(monthStart);
  const monthEndValue = toDateInputValue(monthEnd);
  const previousMonthStartValue = toDateInputValue(previousMonthStart);
  const previousMonthEndValue = toDateInputValue(previousMonthEnd);
  const trendStartValue = toDateInputValue(trendStartDate);
  const interactiveWindowStartValue = toDateInputValue(interactiveWindowStartDate);
  const interactiveWindowEndValue = toDateInputValue(interactiveWindowEndDate);

  const [windowMovementsResult, balanceWindowResult] = await Promise.all([
    supabase
      .from("movimentacoes")
      .select("id, type, description, amount, occurred_on, occurred_at, category")
      .eq("user_id", user.id)
      .gte("occurred_on", interactiveWindowStartValue)
      .lte("occurred_on", interactiveWindowEndValue)
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("movimentacoes")
      .select("type, amount, occurred_on")
      .eq("user_id", user.id)
      .lt("occurred_on", interactiveWindowStartValue),
  ]);

  if (windowMovementsResult.error) {
    throw new Error(`Não foi possível carregar o fechamento agora. Tente novamente em instantes. ${windowMovementsResult.error.message}`);
  }

  if (balanceWindowResult.error) {
    throw new Error(`Não foi possível carregar o saldo do fechamento agora. ${balanceWindowResult.error.message}`);
  }

  if (profileError) {
    throw new Error(`Não foi possível carregar seu saldo atual. Tente novamente em instantes. ${profileError.message}`);
  }

  const monthLabel = formatMonthLabel(selectedMonth);
  const initialBalance = Number(profile?.initial_balance ?? 0);
  const balanceRows = balanceWindowResult.data ?? [];
  const windowMovements = windowMovementsResult.data ?? [];
  const monthMovements = windowMovements.filter(
    (movement) => movement.occurred_on >= monthStartValue && movement.occurred_on <= monthEndValue,
  );
  const windowBalanceBeforeStart = balanceRows.reduce(
    (balance, movement) => {
      if (movement.type === "entrada") {
        return balance + movement.amount;
      }

      if (movement.type === "despesa") {
        return balance - movement.amount;
      }

      return balance;
    },
    Number.isFinite(initialBalance) ? initialBalance : 0,
  );
  const balanceBeforeMonth = windowMovements.reduce(
    (balance, movement) => {
      if (movement.occurred_on >= monthStartValue) {
        return balance;
      }

      if (movement.type === "entrada") {
        return balance + movement.amount;
      }

      if (movement.type === "despesa") {
        return balance - movement.amount;
      }

      return balance;
    },
    windowBalanceBeforeStart,
  );
  const trendRows = windowMovements.filter(
    (movement) => movement.occurred_on >= trendStartValue && movement.occurred_on <= monthEndValue,
  );
  const previousMonthMovements = trendRows.filter(
    (movement) => movement.occurred_on >= previousMonthStartValue && movement.occurred_on <= previousMonthEndValue,
  );

  return (
    <FechamentoMensalOverview
      balanceBeforeMonth={balanceBeforeMonth}
      monthEndValue={monthEndValue}
      monthLabel={monthLabel}
      monthStartValue={monthStartValue}
      monthValue={String(selectedMonth.getMonth() + 1).padStart(2, "0")}
      movements={monthMovements}
      previousMonthEndValue={previousMonthEndValue}
      previousMonthMovements={previousMonthMovements}
      previousMonthStartValue={previousMonthStartValue}
      trendRows={trendRows}
      windowBalanceBeforeStart={windowBalanceBeforeStart}
      windowEndValue={interactiveWindowEndValue}
      windowMovements={windowMovements}
      windowStartValue={interactiveWindowStartValue}
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
