import { Suspense } from "react";
import { RouteTransitionPending } from "@/components/app/route-transition-pending";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { getCurrentUserProfile } from "@/lib/profile";

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<RouteTransitionPending label="Carregando visão geral" />}>
      <DashboardData />
    </Suspense>
  );
}

async function DashboardData() {
  const { profile, profileError, supabase, user } = await getCurrentUserProfile();

  if (!user) {
    throw new Error("Faça login para ver seu resumo.");
  }

  if (profileError) {
    throw new Error(`Não foi possível carregar seu resumo agora. Tente novamente em instantes. ${profileError.message}`);
  }

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
  const yearStartValue = toDateInputValue(yearStart);
  const yearEndValue = toDateInputValue(yearEnd);
  const movementWindowStartValue = previousMonthStartValue < yearStartValue ? previousMonthStartValue : yearStartValue;
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [
    movementWindowResult,
    allMovementsResult,
    recentResult,
    checklistResult,
  ] = await Promise.all([
    supabase
      .from("movimentacoes")
      .select("type, amount, occurred_on")
      .eq("user_id", user.id)
      .gte("occurred_on", movementWindowStartValue)
      .lte("occurred_on", yearEndValue),
    supabase
      .from("movimentacoes")
      .select("type, amount")
      .eq("user_id", user.id),
    supabase
      .from("movimentacoes")
      .select("id, type, description, amount, occurred_on, occurred_at, category")
      .eq("user_id", user.id)
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("obrigacoes_checklist")
      .select("item_key, done")
      .eq("user_id", user.id)
      .eq("month", monthKey),
  ]);

  if (movementWindowResult.error) {
    throw new Error(`Não foi possível carregar o resumo anual agora. Tente novamente em instantes. ${movementWindowResult.error.message}`);
  }

  if (allMovementsResult.error) {
    throw new Error(`Não foi possível carregar o saldo atual agora. Tente novamente em instantes. ${allMovementsResult.error.message}`);
  }

  if (recentResult.error) {
    throw new Error(`Não foi possível carregar suas últimas movimentações agora. Tente novamente em instantes. ${recentResult.error.message}`);
  }

  if (checklistResult.error) {
    throw new Error(`Não foi possível carregar suas obrigações agora. Tente novamente em instantes. ${checklistResult.error.message}`);
  }

  const totals = (movementWindowResult.data ?? []).reduce(
    (acc, movement) => {
      const isCurrentYear = movement.occurred_on >= yearStartValue && movement.occurred_on <= yearEndValue;
      const isCurrentMonth = movement.occurred_on >= monthStartValue && movement.occurred_on <= monthEndValue;
      const isPreviousMonth =
        movement.occurred_on >= previousMonthStartValue && movement.occurred_on <= previousMonthEndValue;

      if (movement.type === "entrada") {
        if (isCurrentYear) {
          acc.annualIncome += movement.amount;
        }

        if (isCurrentMonth) {
          acc.monthlyIncome += movement.amount;
        }
      }

      if (movement.type === "despesa" && isCurrentMonth) {
        acc.monthlyExpense += movement.amount;
      }

      if (movement.type === "entrada" && isPreviousMonth) {
        acc.previousMonthIncome += movement.amount;
      }

      if (movement.type === "despesa" && isPreviousMonth) {
        acc.previousMonthExpense += movement.amount;
      }

      return acc;
    },
    {
      annualIncome: 0,
      monthlyExpense: 0,
      monthlyIncome: 0,
      previousMonthExpense: 0,
      previousMonthIncome: 0,
    },
  );

  const initialBalance = Number(profile?.initial_balance ?? 0);
  const currentBalance = (allMovementsResult.data ?? []).reduce((balance, movement) => {
    if (movement.type === "entrada") {
      return balance + movement.amount;
    }

    if (movement.type === "despesa") {
      return balance - movement.amount;
    }

    return balance;
  }, Number.isFinite(initialBalance) ? initialBalance : 0);

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
      previousMonthExpense={totals.previousMonthExpense}
      previousMonthIncome={totals.previousMonthIncome}
      recentMovements={recentResult.data ?? []}
    />
  );
}
