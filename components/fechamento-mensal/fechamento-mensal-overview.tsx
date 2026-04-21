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

  const comparisonItems = [
    { delta: incomeDelta, label: "Entradas", value: monthlyIncome },
    { delta: expenseDelta, label: "Despesas", value: monthlyExpense },
    { delta: balanceDelta, label: "Resultado", value: balance },
  ];

  const impactItems = [
    {
      label: "Maior entrada",
      title: biggestIncome ? biggestIncome.description : "Sem entradas no período",
      value: biggestIncome ? toCurrency(biggestIncome.amount) : "R$ 0,00",
    },
    {
      label: "Maior despesa",
      title: biggestExpense ? biggestExpense.description : "Sem despesas no período",
      value: biggestExpense ? toCurrency(biggestExpense.amount) : "R$ 0,00",
    },
    {
      label: "Categoria com mais gasto",
      title: topExpenseCategory.top ? topExpenseCategory.top.category : "Sem despesas no período",
      value: topExpenseCategory.top ? toCurrency(topExpenseCategory.top.amount) : "R$ 0,00",
    },
  ];

  return (
    <div className="space-y-3 pb-6">
      <section className="rounded-lg border border-neutral-200 bg-[linear-gradient(180deg,#ffffff_0%,#fafafa_100%)] p-4 shadow-[0_8px_20px_rgba(15,23,42,0.045)] sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div className="space-y-2.5">
            <Badge variant="success" className="w-fit px-2.5 py-0.5">
              Fechamento mensal
            </Badge>
            <div className="space-y-1">
              <h1 className="text-xl font-semibold tracking-tight text-neutral-950 sm:text-[1.75rem]">
                Fechamento de {monthLabel}
              </h1>
              <p className="max-w-2xl text-sm leading-5 text-neutral-600">
                Revise o mês, compare com o anterior e confira os registros usados no fechamento.
              </p>
            </div>
          </div>
          <MonthSelector
            monthValue={monthValue}
            nextHref={nextHref}
            previousHref={previousHref}
            yearValue={yearValue}
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
          <MetricCard
            detail="Total de entradas registradas no mês."
            icon={<ArrowUpRight className="h-4 w-4" />}
            label="Entradas no mês"
            tone="income"
            value={toCurrency(monthlyIncome)}
          />
          <MetricCard
            detail="Total de despesas registradas no mês."
            icon={<ArrowDownLeft className="h-4 w-4" />}
            label="Despesas no mês"
            tone="expense"
            value={toCurrency(monthlyExpense)}
          />
          <ResultSummaryCard
            balance={balance}
            balanceUntilMonth={balanceUntilMonth}
            className="col-span-2 lg:col-span-1"
          />
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-[1.02fr_0.98fr]">
        <Card className="border-neutral-200 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.04)]">
          <CardHeader className="p-3.5 pb-2.5">
            <CardTitle className="text-sm font-semibold text-neutral-950">Comparação rápida</CardTitle>
            <CardDescription className="mt-1 text-xs leading-5">
              Diferença entre o mês escolhido e o anterior.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 p-3.5 pt-0">
            {comparisonItems.map((item) => (
              <ComparisonRow delta={item.delta} key={item.label} label={item.label} value={toCurrency(item.value)} />
            ))}
          </CardContent>
        </Card>

        <Card className="border-neutral-200 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.04)]">
          <CardHeader className="p-3.5 pb-2.5">
            <CardTitle className="text-sm font-semibold text-neutral-950">O que mais pesou</CardTitle>
            <CardDescription className="mt-1 text-xs leading-5">
              Impactos que mais chamam atenção neste fechamento.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 p-3.5 pt-0">
            {impactItems.map((item) => (
              <ImpactRow key={item.label} label={item.label} title={item.title} value={item.value} />
            ))}
          </CardContent>
        </Card>
      </section>

      <Card className="border-neutral-200 bg-white shadow-[0_5px_18px_rgba(15,23,42,0.04)]">
        <CardHeader className="p-3.5 pb-2.5">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base text-neutral-950">Registros do fechamento</CardTitle>
                <Badge variant="secondary" className="h-6 px-2 text-[11px]">
                  {movements.length} registro(s)
                </Badge>
              </div>
              <CardDescription className="text-xs leading-5">
                Movimentações do mês selecionado que compõem este fechamento.
              </CardDescription>
            </div>
            <MovementsCsvExportButton
              buttonClassName="h-8 w-auto px-2.5 text-xs"
              className="self-start"
              filename={`fechoumei-fechamento-${yearValue}-${monthValue}.csv`}
              label="Exportar CSV"
              movements={movements}
            />
          </div>
        </CardHeader>
        <CardContent className="p-3.5 pt-0">
          {movements.length === 0 ? (
            <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50/70 p-4">
              <p className="text-sm font-medium text-neutral-950">Nenhum registro encontrado neste mês.</p>
              <p className="mt-1 text-sm leading-6 text-neutral-600">
                Se o período está certo, registre entradas e despesas com data dentro deste mês.
              </p>
              <Button asChild className="mt-4 h-9 w-full sm:w-auto" size="sm">
                <Link href="/app/movimentacoes">Lançar entrada ou despesa</Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white/70">
              <div className="max-h-[19rem] divide-y divide-neutral-200 overflow-y-auto overscroll-contain md:max-h-[20rem]">
                {movements.map((movement) => (
                  <MovementRow key={movement.id} movement={movement} />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  detail,
  icon,
  label,
  tone,
  value,
}: {
  detail: string;
  icon: ReactNode;
  label: string;
  tone: "expense" | "income";
  value: string;
}) {
  return (
    <Card className="overflow-hidden border-neutral-200 bg-white/95 shadow-[0_3px_14px_rgba(15,23,42,0.04)]">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
            <p
              className={cn(
                "mt-1.5 break-words text-base font-bold leading-tight tabular-nums",
                tone === "income" ? "text-emerald-700" : "text-red-600",
              )}
            >
              {value}
            </p>
          </div>
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
              tone === "income"
                ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                : "border-red-100 bg-red-50 text-red-700",
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

function ResultSummaryCard({
  balance,
  balanceUntilMonth,
  className,
}: {
  balance: number;
  balanceUntilMonth: number;
  className?: string;
}) {
  const resultTone = balance >= 0 ? "text-emerald-700" : "text-red-600";
  const estimatedTone = balanceUntilMonth >= 0 ? "text-neutral-950" : "text-red-600";
  const resultIconTone =
    balance >= 0
      ? "border-emerald-100 bg-emerald-50 text-emerald-700"
      : "border-red-100 bg-red-50 text-red-600";
  const estimatedIconTone =
    balanceUntilMonth >= 0
      ? "border-amber-100 bg-amber-50 text-amber-700"
      : "border-red-100 bg-red-50 text-red-600";

  return (
    <Card className={cn("overflow-hidden border-neutral-200 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.06)]", className)}>
      <CardContent className="space-y-3 p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Resultado do mês</p>
            <p className={cn("mt-1.5 break-words text-xl font-bold leading-tight tabular-nums", resultTone)}>
              {toCurrency(balance)}
            </p>
            <p className="mt-1 text-xs leading-5 text-neutral-600">
              Entradas menos despesas no mês selecionado.
            </p>
          </div>
          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md border", resultIconTone)}>
            <Wallet className="h-4.5 w-4.5" />
          </span>
        </div>

        <div className="rounded-md border border-neutral-200 bg-neutral-50/80 px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Saldo estimado</p>
              <p className={cn("mt-1 text-sm font-bold tabular-nums", estimatedTone)}>
                {toCurrency(balanceUntilMonth)}
              </p>
            </div>
            <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md border", estimatedIconTone)}>
              <ListChecks className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-neutral-600">
            Acumulado até o mês selecionado.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ComparisonRow({ delta, label, value }: { delta: number; label: string; value: string }) {
  const isPositive = delta >= 0;
  const deltaLabel = delta === 0 ? "Sem mudança" : `${isPositive ? "+" : "-"} ${toCurrency(Math.abs(delta))}`;
  const deltaTone = delta === 0 ? "text-neutral-500" : isPositive ? "text-emerald-700" : "text-red-600";

  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-neutral-200 bg-neutral-50/80 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
        <p className="mt-1 text-sm font-semibold tabular-nums text-neutral-950">{value}</p>
      </div>
      <p className={cn("pt-0.5 text-right text-xs font-semibold", deltaTone)}>{deltaLabel}</p>
    </div>
  );
}

function ImpactRow({ label, title, value }: { label: string; title: string; value: string }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50/80 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
          <p className="mt-1 truncate text-sm font-semibold text-neutral-950">{title}</p>
        </div>
        <p className="shrink-0 pt-0.5 text-xs font-semibold tabular-nums text-neutral-600">{value}</p>
      </div>
    </div>
  );
}

function MovementRow({ movement }: { movement: MonthlyMovement }) {
  const isIncome = movement.type === "entrada";

  return (
    <div className="grid grid-cols-[1fr_auto] gap-3 px-3 py-3 sm:px-3.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            variant={isIncome ? "success" : "danger"}
            className={cn(
              "h-5 px-1.5 text-[10px] uppercase tracking-wide",
              isIncome ? "text-emerald-800" : "text-red-700",
            )}
          >
            {isIncome ? "Entrada" : "Despesa"}
          </Badge>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-500">
            <CalendarDays className="h-3.5 w-3.5" />
            {movement.occurred_at ? toDateTime(movement.occurred_at) : toDate(movement.occurred_on)}
          </span>
        </div>
        <p className="mt-1.5 text-sm font-semibold text-neutral-950">{movement.description}</p>
        <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500">{movement.category}</p>
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
  );
}
