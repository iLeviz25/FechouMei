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
    <Suspense fallback={<RouteTransitionPending label="Carregando visão geral" />}>
      <DashboardData />
    </Suspense>
  );
}

async function DashboardData() {
  const supabase = await createClient();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear(), 11, 31);
  const monthStartValue = toDateInputValue(monthStart);
  const monthEndValue = toDateInputValue(monthEnd);
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [yearResult, recentResult, checklistResult] = await Promise.all([
    supabase
      .from("movimentacoes")
      .select("type, amount, occurred_on")
      .gte("occurred_on", toDateInputValue(yearStart))
      .lte("occurred_on", toDateInputValue(yearEnd)),
    supabase
      .from("movimentacoes")
      .select("id, type, description, amount, occurred_on")
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(4),
    supabase
      .from("obrigacoes_checklist")
      .select("item_key, done")
      .eq("month", monthKey),
  ]);

  if (yearResult.error) {
    throw new Error(`Erro ao carregar resumo anual: ${yearResult.error.message}`);
  }

  if (recentResult.error) {
    throw new Error(`Erro ao carregar últimas movimentações: ${recentResult.error.message}`);
  }

  if (checklistResult.error) {
    throw new Error(`Erro ao carregar obrigações do mês: ${checklistResult.error.message}`);
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

  return (
    <DashboardOverview
      checklistDoneCount={(checklistResult.data ?? []).filter((item) => item.done).length}
      dasDone={(checklistResult.data ?? []).some(
        (item) => item.item_key === "pagar-das" && item.done,
      )}
      recentMovements={recentResult.data ?? []}
      {...totals}
    />
  );
}
