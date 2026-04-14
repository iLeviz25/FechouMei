import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthSelector } from "@/components/fechamento-mensal/month-selector";
import type { Movimentacao } from "@/types/database";

type MonthlyMovement = Pick<
  Movimentacao,
  "amount" | "category" | "description" | "id" | "occurred_on" | "type"
>;

type FechamentoMensalOverviewProps = {
  monthLabel: string;
  monthValue: string;
  yearValue: string;
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

export function FechamentoMensalOverview({
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

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Fechamento mensal</p>
            <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Resumo de {monthLabel}
            </h1>
            <p className="max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground">
              Veja rapidamente quanto entrou, quanto saiu e o que compos o fechamento.
            </p>
          </div>
          <MonthSelector
            monthValue={monthValue}
            nextHref={nextHref}
            previousHref={previousHref}
            yearValue={yearValue}
          />
        </div>
      </div>

      {/* Summary Cards */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="transition-shadow hover:shadow-card-hover">
          <CardContent className="p-5">
            <p className="text-sm font-medium text-muted-foreground">Entradas do mes</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-emerald-600">
              {toCurrency(monthlyIncome)}
            </p>
          </CardContent>
        </Card>
        <Card className="transition-shadow hover:shadow-card-hover">
          <CardContent className="p-5">
            <p className="text-sm font-medium text-muted-foreground">Despesas do mes</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-red-600">
              {toCurrency(monthlyExpense)}
            </p>
          </CardContent>
        </Card>
        <Card className="transition-shadow hover:shadow-card-hover">
          <CardContent className="p-5">
            <p className="text-sm font-medium text-muted-foreground">Saldo do mes</p>
            <p className={`mt-1 text-2xl font-semibold tracking-tight ${balance >= 0 ? "text-foreground" : "text-red-600"}`}>
              {toCurrency(balance)}
            </p>
          </CardContent>
        </Card>
        <Card className="transition-shadow hover:shadow-card-hover">
          <CardContent className="p-5">
            <p className="text-sm font-medium text-muted-foreground">Movimentacoes</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{movements.length}</p>
          </CardContent>
        </Card>
      </section>

      {/* Comparison Card */}
      <Card>
        <CardHeader className="p-5 sm:p-6">
          <CardTitle>Comparacao com o mes anterior</CardTitle>
          <CardDescription>Variacao em relacao ao mes anterior.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 p-5 pt-0 sm:grid-cols-3 sm:p-6 sm:pt-0">
          {[
            { label: "Entradas", value: monthlyIncome, delta: incomeDelta },
            { label: "Despesas", value: monthlyExpense, delta: expenseDelta },
            { label: "Saldo", value: balance, delta: balanceDelta },
          ].map((item) => {
            const isPositive = item.delta >= 0;
            const deltaLabel = `${isPositive ? "+" : "-"} ${toCurrency(Math.abs(item.delta))}`;
            return (
              <div className="rounded-xl border border-border/60 bg-muted/30 p-4" key={item.label}>
                <p className="text-sm font-medium text-muted-foreground">{item.label}</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{toCurrency(item.value)}</p>
                <p className={`mt-1 text-xs ${isPositive ? "text-emerald-600" : "text-red-600"}`}>
                  {item.delta === 0 ? "Sem variacao vs mes anterior" : `${deltaLabel} vs mes anterior`}
                </p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Composition Card */}
      <Card>
        <CardHeader className="p-5 sm:p-6">
          <CardTitle>Composicao do mes</CardTitle>
          <CardDescription>O que mais pesou no resultado do mes.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 p-5 pt-0 sm:grid-cols-3 sm:p-6 sm:pt-0">
          <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
            <p className="text-sm font-medium text-muted-foreground">Maior entrada</p>
            <p className="mt-2 truncate font-medium text-foreground">
              {biggestIncome ? biggestIncome.description : "Sem entradas"}
            </p>
            <p className="mt-1 text-sm text-emerald-600">
              {biggestIncome ? toCurrency(biggestIncome.amount) : "R$ 0,00"}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
            <p className="text-sm font-medium text-muted-foreground">Maior despesa</p>
            <p className="mt-2 truncate font-medium text-foreground">
              {biggestExpense ? biggestExpense.description : "Sem despesas"}
            </p>
            <p className="mt-1 text-sm text-red-600">
              {biggestExpense ? toCurrency(biggestExpense.amount) : "R$ 0,00"}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
            <p className="text-sm font-medium text-muted-foreground">Categoria com mais gasto</p>
            <p className="mt-2 truncate font-medium text-foreground">
              {topExpenseCategory.top ? topExpenseCategory.top.category : "Sem despesas"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {topExpenseCategory.top ? toCurrency(topExpenseCategory.top.amount) : "R$ 0,00"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Movements List */}
      <Card>
        <CardHeader className="p-5 sm:p-6">
          <CardTitle>Movimentacoes do mes</CardTitle>
          <CardDescription>Resumo simples das entradas e despesas registradas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5 p-5 pt-0 sm:p-6 sm:pt-0">
          {movements.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-5 text-center">
              <p className="font-medium text-foreground">Nenhuma movimentacao registrada neste mes.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Selecione outro mes ou lance entradas e despesas para fechar.
              </p>
            </div>
          ) : (
            movements.map((movement) => (
              <div
                className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3.5 transition-colors hover:bg-muted/30"
                key={movement.id}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{movement.description}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {movement.type === "entrada" ? "Entrada" : "Despesa"} · {toDate(movement.occurred_on)}
                  </p>
                </div>
                <p
                  className={`shrink-0 font-semibold ${
                    movement.type === "entrada" ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {toCurrency(movement.amount)}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
