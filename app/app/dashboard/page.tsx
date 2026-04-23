import { Suspense } from "react";
import { RouteTransitionPending } from "@/components/app/route-transition-pending";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { createClient } from "@/lib/supabase/server";

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<RouteTransitionPending label="Carregando visao geral" />}>
      <DashboardData />
    </Suspense>
  );
}

async function DashboardData() {
  const supabase = await createClient();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear(), 11, 31);
  const monthStartValue = toDateInputValue(monthStart);
  const monthEndValue = toDateInputValue(monthEnd);
  const previousMonthStartValue = toDateInputValue(previousMonthStart);
  const previousMonthEndValue = toDateInputValue(previousMonthEnd);
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [
    yearResult,
    allMovementsResult,
    recentResult,
    checklistResult,
    profileResult,
    previousMonthResult,
  ] = await Promise.all([
    supabase
      .from("movimentacoes")
      .select("type, amount, occurred_on")
      .gte("occurred_on", toDateInputValue(yearStart))
      .lte("occurred_on", toDateInputValue(yearEnd)),
    supabase
      .from("movimentacoes")
      .select("type, amount"),
    supabase
      .from("movimentacoes")
      .select("id, type, description, amount, occurred_on, occurred_at, category")
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("obrigacoes_checklist")
      .select("item_key, done")
      .eq("month", monthKey),
    supabase
      .from("profiles")
      .select("initial_balance")
      .maybeSingle(),
    supabase
      .from("movimentacoes")
      .select("type, amount")
      .gte("occurred_on", previousMonthStartValue)
      .lte("occurred_on", previousMonthEndValue),
  ]);

  if (yearResult.error) {
    throw new Error(`Erro ao carregar resumo anual: ${yearResult.error.message}`);
  }

  if (allMovementsResult.error) {
    throw new Error(`Erro ao carregar saldo atual: ${allMovementsResult.error.message}`);
  }

  if (recentResult.error) {
    throw new Error(`Erro ao carregar ultimas movimentacoes: ${recentResult.error.message}`);
  }

  if (checklistResult.error) {
    throw new Error(`Erro ao carregar obrigacoes do mes: ${checklistResult.error.message}`);
  }

  if (profileResult.error) {
    throw new Error(`Erro ao carregar ajuste de saldo: ${profileResult.error.message}`);
  }

  if (previousMonthResult.error) {
    throw new Error(`Erro ao carregar comparacao do mes anterior: ${previousMonthResult.error.message}`);
  }

  const totals = (yearResult.data ?? []).reduce(
    (acc, movement) => {
      const isCurrentMonth = movement.occurred_on >= monthStartValue && movement.occurred_on <= monthEndValue;

      if (movement.type === "entrada") {
        acc.annualIncome += movement.amount;
        if (isCurrentMonth) {
          acc.monthlyIncome += movement.amount;
        }
      } else if (isCurrentMonth) {
        acc.monthlyExpense += movement.amount;
      }

      return acc;
    },
    { annualIncome: 0, monthlyExpense: 0, monthlyIncome: 0 },
  );

  const initialBalance = Number(profileResult.data?.initial_balance ?? 0);
  const currentBalance = (allMovementsResult.data ?? []).reduce((balance, movement) => {
    if (movement.type === "entrada") {
      return balance + movement.amount;
    }

    if (movement.type === "despesa") {
      return balance - movement.amount;
    }

    return balance;
  }, Number.isFinite(initialBalance) ? initialBalance : 0);

  const previousMonthTotals = (previousMonthResult.data ?? []).reduce(
    (acc, movement) => {
      if (movement.type === "entrada") {
        acc.income += movement.amount;
      } else if (movement.type === "despesa") {
        acc.expense += movement.amount;
      }

      return acc;
    },
    { expense: 0, income: 0 },
  );

  return (
    <DashboardOverview
      annualIncome={totals.annualIncome}
      checklistDoneCount={(checklistResult.data ?? []).filter((item) => item.done).length}
      currentBalance={currentBalance}
      dasDone={(checklistResult.data ?? []).some(
        (item) => item.item_key === "pagar-das" && item.done,
      )}
      monthlyExpense={totals.monthlyExpense}
      monthlyIncome={totals.monthlyIncome}
      previousMonthExpense={previousMonthTotals.expense}
      previousMonthIncome={previousMonthTotals.income}
      recentMovements={recentResult.data ?? []}
    />
  );
}
