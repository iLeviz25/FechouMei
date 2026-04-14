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
      <div className="space-y-2">
        <Badge variant="success" className="w-fit">
          Fechamento mensal
        </Badge>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-950 sm:text-3xl">
              Resumo de {monthLabel}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
              Veja rapidamente quanto entrou, quanto saiu e o que compôs o fechamento.
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

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-neutral-500">Entradas do mês</p>
            <p className="mt-1 text-xl font-semibold text-emerald-700">{toCurrency(monthlyIncome)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-neutral-500">Despesas do mês</p>
            <p className="mt-1 text-xl font-semibold text-red-600">{toCurrency(monthlyExpense)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-neutral-500">Saldo do mês</p>
            <p className="mt-1 text-xl font-semibold text-neutral-950">{toCurrency(balance)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-neutral-500">Movimentações do mês</p>
            <p className="mt-1 text-xl font-semibold text-neutral-950">{movements.length}</p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle>Comparação com o mês anterior</CardTitle>
          <CardDescription>Variação em relação ao mês anterior.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 pt-0 sm:grid-cols-3 sm:p-6 sm:pt-0">
          {[
            { label: "Entradas", value: monthlyIncome, delta: incomeDelta },
            { label: "Despesas", value: monthlyExpense, delta: expenseDelta },
            { label: "Saldo", value: balance, delta: balanceDelta },
          ].map((item) => {
            const isPositive = item.delta >= 0;
            const deltaLabel = `${isPositive ? "↑" : "↓"} ${toCurrency(Math.abs(item.delta))}`;
            return (
              <div className="rounded-md border p-3" key={item.label}>
                <p className="text-sm text-neutral-500">{item.label}</p>
                <p className="mt-2 text-sm font-medium text-neutral-950">{toCurrency(item.value)}</p>
                <p className={`mt-1 text-xs ${isPositive ? "text-emerald-700" : "text-red-600"}`}>
                  {item.delta === 0 ? "Sem variação vs mês anterior" : `${deltaLabel} vs mês anterior`}
                </p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle>Composição do mês</CardTitle>
          <CardDescription>O que mais pesou no resultado do mês.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 pt-0 sm:grid-cols-3 sm:p-6 sm:pt-0">
          <div className="rounded-md border p-3">
            <p className="text-sm text-neutral-500">Maior entrada</p>
            <p className="mt-2 text-sm font-medium text-neutral-950">
              {biggestIncome ? biggestIncome.description : "Sem entradas"}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              {biggestIncome ? toCurrency(biggestIncome.amount) : "R$ 0,00"}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-sm text-neutral-500">Maior despesa</p>
            <p className="mt-2 text-sm font-medium text-neutral-950">
              {biggestExpense ? biggestExpense.description : "Sem despesas"}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              {biggestExpense ? toCurrency(biggestExpense.amount) : "R$ 0,00"}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-sm text-neutral-500">Categoria com mais gasto</p>
            <p className="mt-2 text-sm font-medium text-neutral-950">
              {topExpenseCategory.top ? topExpenseCategory.top.category : "Sem despesas"}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              {topExpenseCategory.top ? toCurrency(topExpenseCategory.top.amount) : "R$ 0,00"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle>Movimentações do mês</CardTitle>
          <CardDescription>Resumo simples das entradas e despesas registradas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
          {movements.length === 0 ? (
            <p className="text-sm leading-6 text-neutral-600">
              Nenhuma movimentação registrada neste mês. Selecione outro mês ou lance entradas e despesas para fechar.
            </p>
          ) : (
            movements.map((movement) => (
              <div className="rounded-md border p-3" key={movement.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-950">{movement.description}</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {movement.type === "entrada" ? "Entrada" : "Despesa"} · {toDate(movement.occurred_on)}
                    </p>
                  </div>
                  <p
                    className={
                      movement.type === "entrada"
                        ? "shrink-0 text-sm font-semibold text-emerald-700"
                        : "shrink-0 text-sm font-semibold text-red-600"
                    }
                  >
                    {toCurrency(movement.amount)}
                  </p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
