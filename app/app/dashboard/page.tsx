import { Suspense } from "react";
import { RouteTransitionPending } from "@/components/app/route-transition-pending";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUserProfile } from "@/lib/profile";
import type { Movimentacao } from "@/types/database";

type DashboardMovement = Pick<Movimentacao, "amount" | "occurred_on" | "type">;
type DashboardRecentMovement = Pick<
  Movimentacao,
  "amount" | "category" | "description" | "id" | "occurred_at" | "occurred_on" | "type"
>;
type DashboardChecklistItem = {
  done: boolean;
  item_key: string;
};
type DashboardQueryResult<T> = {
  data: T | null;
  error: { message?: string } | null;
};
type DashboardQueryOutcome<T> = {
  data: T | null;
  error: string | null;
};

const CRITICAL_DASHBOARD_TIMEOUT_MS = 8000;
const SECONDARY_DASHBOARD_TIMEOUT_MS = 5500;

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardLoadingFallback />}>
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

  const [movementsResult, recentResult, checklistResult] = await Promise.all([
    loadDashboardQuery<DashboardMovement[]>(
      "movements summary",
      supabase
        .from("movimentacoes")
        .select("type, amount, occurred_on")
        .eq("user_id", user.id),
      CRITICAL_DASHBOARD_TIMEOUT_MS,
    ),
    loadDashboardQuery<DashboardRecentMovement[]>(
      "recent movements",
      supabase
        .from("movimentacoes")
        .select("id, type, description, amount, occurred_on, occurred_at, category")
        .eq("user_id", user.id)
        .order("occurred_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(6),
      SECONDARY_DASHBOARD_TIMEOUT_MS,
    ),
    loadDashboardQuery<DashboardChecklistItem[]>(
      "monthly checklist",
      supabase
        .from("obrigacoes_checklist")
        .select("item_key, done")
        .eq("user_id", user.id)
        .eq("month", monthKey),
      SECONDARY_DASHBOARD_TIMEOUT_MS,
    ),
  ]);

  if (movementsResult.error) {
    return <DashboardUnavailable />;
  }

  const allMovements = movementsResult.data ?? [];
  const checklistItems = checklistResult.data ?? [];
  const totals = allMovements.reduce(
    (acc, movement) => {
      const isInsideWindow = movement.occurred_on >= movementWindowStartValue && movement.occurred_on <= yearEndValue;
      const isCurrentYear = movement.occurred_on >= yearStartValue && movement.occurred_on <= yearEndValue;
      const isCurrentMonth = movement.occurred_on >= monthStartValue && movement.occurred_on <= monthEndValue;
      const isPreviousMonth =
        movement.occurred_on >= previousMonthStartValue && movement.occurred_on <= previousMonthEndValue;

      if (!isInsideWindow) {
        return acc;
      }

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
  const currentBalance = allMovements.reduce((balance, movement) => {
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
      checklistAvailable={!checklistResult.error}
      checklistDoneCount={checklistItems.filter((item) => item.done).length}
      currentBalance={currentBalance}
      dasDone={checklistItems.some(
        (item) => item.item_key === "pagar-das" && item.done,
      )}
      monthlyExpense={totals.monthlyExpense}
      monthlyIncome={totals.monthlyIncome}
      previousMonthExpense={totals.previousMonthExpense}
      previousMonthIncome={totals.previousMonthIncome}
      recentMovementsAvailable={!recentResult.error}
      recentMovements={recentResult.data ?? []}
    />
  );
}

async function loadDashboardQuery<T>(
  label: string,
  query: PromiseLike<DashboardQueryResult<T>>,
  timeoutMs: number,
): Promise<DashboardQueryOutcome<T>> {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  try {
    const result = await Promise.race([
      Promise.resolve(query),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`${label} timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);

    if (result.error) {
      return { data: null, error: result.error.message ?? `${label} failed` };
    }

    return { data: result.data, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : `${label} failed`;
    console.warn(`[dashboard] ${message}`);
    return { data: null, error: message };
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function DashboardLoadingFallback() {
  return (
    <div className="mobile-section-gap mx-auto w-full max-w-[430px] px-1 sm:max-w-none sm:px-0">
      <RouteTransitionPending label="Carregando visão geral" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="h-28 rounded-[24px] bg-muted/60" />
        <div className="h-28 rounded-[24px] bg-muted/60" />
        <div className="h-28 rounded-[24px] bg-muted/60" />
        <div className="h-28 rounded-[24px] bg-muted/60" />
      </div>
      <div className="h-56 rounded-[30px] bg-muted/50" />
    </div>
  );
}

function DashboardUnavailable() {
  return (
    <div className="mobile-section-gap mx-auto w-full max-w-[720px] px-1 sm:px-0">
      <Card className="overflow-hidden rounded-[30px] border-border/70">
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">Dashboard</p>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground">Resumo temporariamente indisponível</h1>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            Uma consulta principal demorou mais que o limite seguro e foi interrompida para a tela não ficar travada.
          </p>
          <p className="rounded-2xl border border-border/70 bg-muted/40 p-3 text-xs font-semibold text-muted-foreground">
            Código de suporte: dashboard-timeout
          </p>
          <Button asChild>
            <a href="/app/dashboard">Tentar carregar novamente</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
