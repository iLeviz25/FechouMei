import type { ReactNode } from "react";
import { ArrowDownLeft, ArrowUpRight, CalendarDays, ListChecks, Wallet } from "lucide-react";
import Link from "next/link";
import { MovementsCsvExportButton } from "@/components/app/movements-csv-export-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthSelector } from "@/components/fechamento-mensal/month-selector";
import { cn } from "@/lib/utils";
import type { Movimentacao } from "@/types/database";

type MonthlyMovement = Pick<
  Movimentacao,
  "amount" | "category" | "description" | "id" | "occurred_at" | "occurred_on" | "type"
>;

type FechamentoMensalOverviewProps = {
  monthLabel: string;
  monthValue: string;
  yearValue: string;
  balanceUntilMonth: number;
  monthlyExpense: number;
  monthlyIncome: number;
  previousMonthlyExpense: number;
  previousMonthlyIncome: number;
  movements: MonthlyMovement[];
  nextHref: string;
  previousHref: string;
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function toCurrency(value: number) {
  return currencyFormatter.format(value);
}

function toDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function toDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

export function FechamentoMensalOverview({
  balanceUntilMonth,
  monthLabel,
  monthValue,
  yearValue,
  monthlyExpense,
  monthlyIncome,
  previousMonthlyExpense,
  previousMonthlyIncome,
  movements,
  nextHref,
  previousHref,
}: FechamentoMensalOverviewProps) {
  const balance = monthlyIncome - monthlyExpense;
  const previousBalance = previousMonthlyIncome - previousMonthlyExpense;
  const balanceDelta = balance - previousBalance;
  const incomeDelta = monthlyIncome - previousMonthlyIncome;
  const expenseDelta = monthlyExpense - previousMonthlyExpense;
  const biggestIncome = movements
    .filter((movement) => movement.type === "entrada")
    .sort((a, b) => b.amount - a.amount)[0];
  const biggestExpense = movements
    .filter((movement) => movement.type === "despesa")
    .sort((a, b) => b.amount - a.amount)[0];
  const topExpenseCategory = movements.reduce(
    (acc, movement) => {
      if (movement.type !== "despesa") {
        return acc;
      }
      const nextTotal = (acc.byCategory[movement.category] ?? 0) + movement.amount;
      acc.byCategory[movement.category] = nextTotal;
      if (!acc.top || nextTotal > acc.top.amount) {
        acc.top = { category: movement.category, amount: nextTotal };
      }
      return acc;
    },
    { byCategory: {} as Record<string, number>, top: null as null | { category: string; amount: number } },
  );

  const summaryCards = [
    {
      detail: "Total de entradas registradas no mês",
      icon: ArrowUpRight,
      label: "Entradas no mês",
      tone: "income" as const,
      value: toCurrency(monthlyIncome),
    },
    {
      detail: "Total de despesas registradas no mês",
      icon: ArrowDownLeft,
      label: "Despesas no mês",
      tone: "expense" as const,
      value: toCurrency(monthlyExpense),
    },
    {
      detail: balance >= 0 ? "Entradas menos despesas do mês" : "Despesas acima das entradas",
      icon: Wallet,
      label: "Resultado do mês",
      tone: balance >= 0 ? ("balance" as const) : ("expense" as const),
      value: toCurrency(balance),
    },
    {
      detail: "Ponto de partida mais registros até este mês",
      icon: ListChecks,
      label: "Saldo estimado",
      tone: balanceUntilMonth >= 0 ? ("balance" as const) : ("expense" as const),
      value: toCurrency(balanceUntilMonth),
    },
  ];

  const comparisonItems = [
    { label: "Entradas", value: monthlyIncome, delta: incomeDelta },
    { label: "Despesas", value: monthlyExpense, delta: expenseDelta },
    { label: "Saldo", value: balance, delta: balanceDelta },
  ];

  return (
    <div className="space-y-3.5 pb-6 sm:space-y-4">
      <header className="space-y-3">
        <div className="grid gap-3 lg:grid-cols-[1fr_300px] lg:items-start">
          <div className="space-y-2">
            <Badge variant="success" className="w-fit px-2.5 py-0.5">
              Fechamento mensal
            </Badge>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-neutral-950 sm:text-[1.75rem]">
                Fechamento de {monthLabel}
              </h1>
              <p className="mt-1.5 max-w-2xl text-sm leading-6 text-neutral-600">
                Confira se os registros do mês fazem sentido antes de dar o mês como organizado.
              </p>
            </div>
          </div>
          <div className="w-full lg:justify-self-end">
            <MonthSelector
              monthValue={monthValue}
              nextHref={nextHref}
              previousHref={previousHref}
              yearValue={yearValue}
            />
          </div>
        </div>
      </header>

      <section className="space-y-2.5">
        <div className="px-0.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Comparação</p>
          <h2 className="mt-0.5 text-lg font-semibold text-neutral-950">Como este mês se compara</h2>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.02fr_0.98fr] lg:items-start">
          <Card className="overflow-hidden border-neutral-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.065)]">
            <CardHeader className="p-4 pb-2.5 sm:p-4 sm:pb-2.5">
              <CardTitle className="text-neutral-950">Comparação com o mês anterior</CardTitle>
              <CardDescription className="mt-1">Diferença entre o mês escolhido e o mês anterior.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2.5 p-4 pt-0 sm:grid-cols-3 sm:p-4 sm:pt-0">
              {comparisonItems.map((item) => (
                <ComparisonCard
                  delta={item.delta}
                  key={item.label}
                  label={item.label}
                  value={toCurrency(item.value)}
                />
              ))}
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-neutral-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.065)]">
            <CardHeader className="p-4 pb-2.5 sm:p-4 sm:pb-2.5">
              <CardTitle className="text-neutral-950">Maiores impactos</CardTitle>
              <CardDescription className="mt-1">Entradas, despesas e categoria que mais mudam o resultado.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2.5 p-4 pt-0 sm:grid-cols-3 sm:p-4 sm:pt-0">
              <CompositionItem
                label="Maior entrada"
                title={biggestIncome ? biggestIncome.description : "Sem entradas"}
                value={biggestIncome ? toCurrency(biggestIncome.amount) : "R$ 0,00"}
              />
              <CompositionItem
                label="Maior despesa"
                title={biggestExpense ? biggestExpense.description : "Sem despesas"}
                value={biggestExpense ? toCurrency(biggestExpense.amount) : "R$ 0,00"}
              />
              <CompositionItem
                label="Categoria com mais gasto"
                title={topExpenseCategory.top ? topExpenseCategory.top.category : "Sem despesas"}
                value={topExpenseCategory.top ? toCurrency(topExpenseCategory.top.amount) : "R$ 0,00"}
              />
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-2">
        <div className="px-0.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Resultado</p>
          <h2 className="mt-0.5 text-base font-semibold text-neutral-950">Resumo do mês escolhido</h2>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <SummaryCard
                detail={card.detail}
                icon={<Icon className="h-4 w-4" />}
                key={card.label}
                label={card.label}
                tone={card.tone}
                value={card.value}
              />
            );
          })}
        </div>
      </section>

      <Card className="border-neutral-200 bg-white shadow-[0_5px_18px_rgba(15,23,42,0.04)]">
        <CardHeader className="p-3.5 pb-2.5 sm:p-4 sm:pb-2.5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base text-neutral-950">Registros que formam o fechamento</CardTitle>
              <CardDescription className="mt-1">
                Entradas e despesas usadas nos totais acima.
              </CardDescription>
            </div>
            <div className="flex w-full shrink-0 flex-col items-stretch gap-2 sm:w-auto sm:items-end">
              <Badge variant="secondary" className="shrink-0">
                {movements.length} registro(s)
              </Badge>
              <MovementsCsvExportButton
                className="w-full sm:w-auto"
                filename={`fechoumei-fechamento-${yearValue}-${monthValue}.csv`}
                label="Exportar mês em CSV"
                movements={movements}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 p-4 pt-0 sm:p-4 sm:pt-0">
          {movements.length === 0 ? (
            <div className="rounded-md border border-dashed border-neutral-300 bg-neutral-50/70 p-4">
              <p className="text-sm font-medium text-neutral-950">Nenhum registro encontrado para este mês.</p>
              <p className="mt-1 text-sm leading-6 text-neutral-600">
                Se o mês está correto, lance entradas e despesas com data dentro deste período.
                Assim o fechamento passa a mostrar os totais e a lista usada no CSV.
              </p>
              <Button asChild className="mt-4 h-9 w-full sm:w-auto" size="sm">
                <Link href="/app/movimentacoes">Lançar entrada ou despesa</Link>
              </Button>
            </div>
          ) : (
            <div className="max-h-[18rem] space-y-2 overflow-y-auto overflow-x-hidden pr-1 overscroll-contain sm:max-h-[20rem] lg:max-h-[21rem]">
              {movements.map((movement) => (
                <MovementRow key={movement.id} movement={movement} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  detail,
  icon,
  label,
  tone,
  value,
}: {
  detail: string;
  icon: ReactNode;
  label: string;
  tone: "income" | "expense" | "balance" | "neutral";
  value: string;
}) {
  return (
    <Card className="relative overflow-hidden border-neutral-200 bg-white/95 shadow-[0_3px_14px_rgba(15,23,42,0.04)]">
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-0.5",
          tone === "income" && "bg-emerald-600",
          tone === "expense" && "bg-red-500",
          tone === "balance" && "bg-neutral-800",
          tone === "neutral" && "bg-amber-500",
        )}
      />
      <CardContent className="p-3.5">
        <div className="flex items-start justify-between gap-3 pt-1">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
            <p
              className={cn(
                "mt-1.5 break-words text-lg font-bold leading-tight tabular-nums text-neutral-950",
                tone === "income" && "text-emerald-700",
                tone === "expense" && "text-red-600",
              )}
            >
              {value}
            </p>
          </div>
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
              tone === "income" && "border-emerald-100 bg-emerald-50 text-emerald-700",
              tone === "expense" && "border-red-100 bg-red-50 text-red-700",
              tone === "balance" && "border-neutral-200 bg-neutral-50 text-neutral-800",
              tone === "neutral" && "border-amber-100 bg-amber-50 text-amber-700",
            )}
          >
            {icon}
          </span>
        </div>
        <p className="mt-1.5 text-xs leading-5 text-neutral-600">{detail}</p>
      </CardContent>
    </Card>
  );
}

function ComparisonCard({ delta, label, value }: { delta: number; label: string; value: string }) {
  const isPositive = delta >= 0;
  const deltaLabel = `${isPositive ? "+" : "-"} ${toCurrency(Math.abs(delta))}`;

  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50/70 p-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1.5 text-base font-bold tabular-nums text-neutral-950">{value}</p>
      <p className={cn("mt-1 text-xs font-semibold", isPositive ? "text-emerald-700" : "text-red-600")}>
        {delta === 0 ? "Sem mudança em relação ao mês anterior" : `${deltaLabel} em relação ao mês anterior`}
      </p>
    </div>
  );
}

function CompositionItem({ label, title, value }: { label: string; title: string; value: string }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50/70 p-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1.5 truncate text-sm font-semibold text-neutral-950">{title}</p>
      <p className="mt-1 text-xs font-semibold tabular-nums text-neutral-500">{value}</p>
    </div>
  );
}

function MovementRow({ movement }: { movement: MonthlyMovement }) {
  const isIncome = movement.type === "entrada";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md border border-neutral-200 bg-white p-2.5 pl-4 shadow-[0_4px_14px_rgba(15,23,42,0.04)]",
        "before:absolute before:inset-y-0 before:left-0 before:w-1",
        isIncome ? "before:bg-emerald-500" : "before:bg-red-400",
      )}
    >
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant={isIncome ? "success" : "danger"}
              className={cn(
                "px-2 py-0.5 text-[11px]",
                isIncome ? "text-emerald-800" : "text-red-700",
              )}
            >
              {isIncome ? "Entrada" : "Despesa"}
            </Badge>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500">
              <CalendarDays className="h-3.5 w-3.5" />
              {movement.occurred_at ? toDateTime(movement.occurred_at) : toDate(movement.occurred_on)}
            </span>
          </div>
          <p className="mt-1 truncate text-sm font-semibold text-neutral-950">{movement.description}</p>
          <p className="mt-0.5 text-xs font-medium text-neutral-500">{movement.category}</p>
        </div>
        <p
          className={cn(
            "shrink-0 pt-0.5 text-right text-sm font-bold tabular-nums",
            isIncome ? "text-emerald-700" : "text-red-600",
          )}
        >
          {toCurrency(movement.amount)}
        </p>
      </div>
    </div>
  );
}
