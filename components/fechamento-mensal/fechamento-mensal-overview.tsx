import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Flame,
  Receipt,
  Sparkles,
  Tag,
  TrendingDown,
  TrendingUp,
  Trophy,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { MovementsCsvExportButton } from "@/components/app/movements-csv-export-button";
import { MonthSelector } from "@/components/fechamento-mensal/month-selector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  const monthBalance = monthlyIncome - monthlyExpense;
  const previousBalance = previousMonthlyIncome - previousMonthlyExpense;
  const balanceDelta = monthBalance - previousBalance;
  const incomeDelta = monthlyIncome - previousMonthlyIncome;
  const expenseDelta = monthlyExpense - previousMonthlyExpense;

  const biggestIncome = movements.filter((item) => item.type === "entrada").sort((a, b) => b.amount - a.amount)[0];
  const biggestExpense = movements.filter((item) => item.type === "despesa").sort((a, b) => b.amount - a.amount)[0];
  const topExpenseCategory = movements.reduce(
    (acc, movement) => {
      if (movement.type !== "despesa") {
        return acc;
      }

      const nextAmount = (acc.byCategory[movement.category] ?? 0) + movement.amount;
      acc.byCategory[movement.category] = nextAmount;

      if (!acc.top || nextAmount > acc.top.amount) {
        acc.top = { amount: nextAmount, category: movement.category };
      }

      return acc;
    },
    { byCategory: {} as Record<string, number>, top: null as null | { amount: number; category: string } },
  );

  const comparisonItems = [
    { delta: incomeDelta, label: "Entradas", value: monthlyIncome },
    { delta: expenseDelta, label: "Despesas", value: monthlyExpense },
    { delta: balanceDelta, label: "Resultado", value: monthBalance },
  ];

  const highlightItems = [
    {
      icon: Trophy,
      label: "Maior entrada",
      tone: "success" as const,
      title: biggestIncome ? biggestIncome.description : "Sem entradas no periodo",
      value: biggestIncome ? toCurrency(biggestIncome.amount) : "R$ 0,00",
    },
    {
      icon: Flame,
      label: "Maior despesa",
      tone: "danger" as const,
      title: biggestExpense ? biggestExpense.description : "Sem despesas no periodo",
      value: biggestExpense ? toCurrency(biggestExpense.amount) : "R$ 0,00",
    },
    {
      icon: Tag,
      label: "Categoria com mais gasto",
      tone: "warning" as const,
      title: topExpenseCategory.top ? topExpenseCategory.top.category : "Sem despesas no periodo",
      value: topExpenseCategory.top ? toCurrency(topExpenseCategory.top.amount) : "R$ 0,00",
    },
  ];

  return (
    <div className="space-y-5 pb-6">
      <section className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <Card className="overflow-hidden bg-gradient-hero text-primary-foreground">
          <CardContent className="space-y-5 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <Badge className="w-fit border-white/10 bg-white/10 text-primary-foreground" variant="secondary">
                  <Sparkles className="mr-1 h-3 w-3" />
                  Fechamento mensal
                </Badge>
                <div className="space-y-1">
                  <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Fechamento de {monthLabel}</h1>
                  <p className="max-w-2xl text-sm leading-6 text-primary-foreground/80">
                    Revise o mes, compare com o anterior e confira os registros usados no fechamento.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-primary-foreground/70">
                  Resultado do mes
                </p>
                <p
                  className={cn(
                    "font-mono mt-1 text-2xl font-extrabold tabular",
                    monthBalance >= 0 ? "text-primary-foreground" : "text-secondary",
                  )}
                >
                  {toCurrency(monthBalance)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <MetricCard detail="total do mes" icon={ArrowDownLeft} label="Entradas" tone="success" value={toCurrency(monthlyIncome)} />
              <MetricCard detail="total do mes" icon={ArrowUpRight} label="Despesas" tone="danger" value={toCurrency(monthlyExpense)} />
              <MetricCard
                className="col-span-2 lg:col-span-1"
                detail="acumulado ate este periodo"
                icon={Wallet}
                label="Saldo acumulado"
                tone={balanceUntilMonth >= 0 ? "primary" : "danger"}
                value={toCurrency(balanceUntilMonth)}
              />
            </div>
          </CardContent>
        </Card>

        <MonthSelector
          monthValue={monthValue}
          nextHref={nextHref}
          previousHref={previousHref}
          yearValue={yearValue}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardContent className="space-y-3 p-5 sm:p-6">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                Comparacao rapida
              </p>
              <h2 className="mt-1 text-lg font-extrabold tracking-tight text-foreground">Versus mes anterior</h2>
            </div>

            {comparisonItems.map((item) => (
              <ComparisonRow delta={item.delta} key={item.label} label={item.label} value={toCurrency(item.value)} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5 sm:p-6">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Destaques</p>
              <h2 className="mt-1 text-lg font-extrabold tracking-tight text-foreground">O que mais pesou no mes</h2>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {highlightItems.map((item) => (
                <HighlightCard
                  icon={item.icon}
                  key={item.label}
                  label={item.label}
                  title={item.title}
                  tone={item.tone}
                  value={item.value}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                Registros do fechamento
              </p>
              <h2 className="mt-1 text-lg font-extrabold tracking-tight text-foreground">
                {movements.length} registro(s) compoem este fechamento
              </h2>
            </div>
            <MovementsCsvExportButton
              buttonClassName="h-10 px-4 text-sm"
              filename={`fechoumei-fechamento-${yearValue}-${monthValue}.csv`}
              label="Exportar CSV"
              movements={movements}
            />
          </div>

          {movements.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-border bg-muted/40 p-5 text-sm leading-6 text-muted-foreground">
              <p className="font-bold text-foreground">Nenhum registro encontrado neste mes.</p>
              <p className="mt-1">Se o periodo estiver certo, adicione entradas e despesas com datas deste mes.</p>
              <Button asChild className="mt-4" size="sm">
                <Link href="/app/movimentacoes">Lancar movimentacao</Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-[24px] border border-border/70 bg-card">
              <div className="divide-y divide-border/60">
                {movements.map((movement) => (
                  <div
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-primary-soft/30 sm:px-5"
                    key={movement.id}
                  >
                    <div
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                        movement.type === "entrada"
                          ? "bg-success/10 text-success"
                          : "bg-destructive/10 text-destructive",
                      )}
                    >
                      {movement.type === "entrada" ? (
                        <ArrowDownLeft className="h-5 w-5" />
                      ) : (
                        <ArrowUpRight className="h-5 w-5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-foreground">{movement.description}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {movement.category} -{" "}
                        {movement.occurred_at ? toDateTime(movement.occurred_at) : toDate(movement.occurred_on)}
                      </p>
                    </div>
                    <p
                      className={cn(
                        "font-mono text-sm font-extrabold tabular",
                        movement.type === "entrada" ? "text-success" : "text-foreground",
                      )}
                    >
                      {movement.type === "entrada" ? "+" : "-"} {toCurrency(movement.amount)}
                    </p>
                  </div>
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
  className,
  detail,
  icon: Icon,
  label,
  tone,
  value,
}: {
  className?: string;
  detail: string;
  icon: typeof Receipt;
  label: string;
  tone: "success" | "danger" | "primary";
  value: string;
}) {
  return (
    <div className={cn("rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-primary-foreground/70">{label}</p>
          <p className="font-mono mt-2 text-xl font-extrabold tabular text-primary-foreground">{value}</p>
          <p className="mt-1 text-xs text-primary-foreground/70">{detail}</p>
        </div>
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
            tone === "success" && "bg-success/15 text-white",
            tone === "danger" && "bg-destructive/15 text-white",
            tone === "primary" && "bg-white/15 text-white",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function ComparisonRow({ delta, label, value }: { delta: number; label: string; value: string }) {
  const positive = delta >= 0;
  const TrendIcon = positive ? TrendingUp : TrendingDown;

  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        <p className="font-mono mt-1 text-base font-extrabold tabular text-foreground">{value}</p>
      </div>
      <div
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold",
          positive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
        )}
      >
        <TrendIcon className="h-3 w-3" />
        {positive ? "+" : ""}
        {toCurrency(Math.abs(delta))}
      </div>
    </div>
  );
}

function HighlightCard({
  icon: Icon,
  label,
  title,
  tone,
  value,
}: {
  icon: typeof Trophy;
  label: string;
  title: string;
  tone: "success" | "danger" | "warning";
  value: string;
}) {
  return (
    <div className="rounded-[24px] border border-border/70 bg-muted/30 p-4">
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-2xl",
          tone === "success" && "bg-success/10 text-success",
          tone === "danger" && "bg-destructive/10 text-destructive",
          tone === "warning" && "bg-secondary-soft text-secondary-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-foreground">{title}</p>
      <p className="font-mono mt-2 text-sm font-extrabold tabular text-foreground">{value}</p>
    </div>
  );
}
