"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarRange,
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
import { getMovementVisualTone } from "@/lib/movement-visuals";
import { cn } from "@/lib/utils";
import type { Movimentacao } from "@/types/database";

type MonthlyMovement = Pick<
  Movimentacao,
  "amount" | "category" | "description" | "id" | "occurred_at" | "occurred_on" | "type"
>;

type BalanceMovement = Pick<Movimentacao, "amount" | "occurred_on" | "type">;

type FechamentoMensalOverviewProps = {
  balanceRows: BalanceMovement[];
  initialBalance: number;
  monthEndValue: string;
  monthLabel: string;
  monthStartValue: string;
  monthValue: string;
  movements: MonthlyMovement[];
  previousMonthEndValue: string;
  previousMonthMovements: BalanceMovement[];
  previousMonthStartValue: string;
  yearValue: string;
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
  balanceRows,
  initialBalance,
  monthEndValue,
  monthLabel,
  monthStartValue,
  monthValue,
  movements,
  previousMonthEndValue,
  previousMonthMovements,
  previousMonthStartValue,
  yearValue,
}: FechamentoMensalOverviewProps) {
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");

  useEffect(() => {
    setRangeStart("");
    setRangeEnd("");
  }, [monthEndValue, monthStartValue]);

  const hasCustomRange = rangeStart !== "" || rangeEnd !== "";
  const effectiveStart = rangeStart || monthStartValue;
  const effectiveEnd = rangeEnd || monthEndValue;
  const effectivePeriodLabel = hasCustomRange ? `${toDate(effectiveStart)} a ${toDate(effectiveEnd)}` : monthLabel;
  const comparisonLabel = hasCustomRange ? "Mesmo trecho no mes anterior" : "Versus mes anterior";

  const filteredMovements = useMemo(
    () =>
      movements.filter((movement) => movement.occurred_on >= effectiveStart && movement.occurred_on <= effectiveEnd),
    [effectiveEnd, effectiveStart, movements],
  );

  const monthlyTotals = useMemo(
    () =>
      filteredMovements.reduce(
        (acc, movement) => {
          if (movement.type === "entrada") {
            acc.monthlyIncome += movement.amount;
          } else {
            acc.monthlyExpense += movement.amount;
          }

          return acc;
        },
        { monthlyExpense: 0, monthlyIncome: 0 },
      ),
    [filteredMovements],
  );

  const previousRange = useMemo(() => {
    if (!hasCustomRange) {
      return {
        end: previousMonthEndValue,
        start: previousMonthStartValue,
      };
    }

    return {
      end: rangeEnd ? mapDateToMonth(rangeEnd, previousMonthStartValue) : previousMonthEndValue,
      start: rangeStart ? mapDateToMonth(rangeStart, previousMonthStartValue) : previousMonthStartValue,
    };
  }, [hasCustomRange, previousMonthEndValue, previousMonthStartValue, rangeEnd, rangeStart]);

  const previousTotals = useMemo(
    () =>
      previousMonthMovements.reduce(
        (acc, movement) => {
          if (movement.occurred_on < previousRange.start || movement.occurred_on > previousRange.end) {
            return acc;
          }

          if (movement.type === "entrada") {
            acc.monthlyIncome += movement.amount;
          } else {
            acc.monthlyExpense += movement.amount;
          }

          return acc;
        },
        { monthlyExpense: 0, monthlyIncome: 0 },
      ),
    [previousMonthMovements, previousRange.end, previousRange.start],
  );

  const monthBalance = monthlyTotals.monthlyIncome - monthlyTotals.monthlyExpense;
  const previousBalance = previousTotals.monthlyIncome - previousTotals.monthlyExpense;
  const balanceDelta = monthBalance - previousBalance;
  const incomeDelta = monthlyTotals.monthlyIncome - previousTotals.monthlyIncome;
  const expenseDelta = monthlyTotals.monthlyExpense - previousTotals.monthlyExpense;
  const balanceUntilPeriod = useMemo(() => {
    const safeInitialBalance = Number.isFinite(initialBalance) ? initialBalance : 0;

    return balanceRows.reduce((balance, movement) => {
      if (movement.occurred_on > effectiveEnd) {
        return balance;
      }

      if (movement.type === "entrada") {
        return balance + movement.amount;
      }

      if (movement.type === "despesa") {
        return balance - movement.amount;
      }

      return balance;
    }, safeInitialBalance);
  }, [balanceRows, effectiveEnd, initialBalance]);

  const biggestIncome = filteredMovements
    .filter((item) => item.type === "entrada")
    .sort((a, b) => b.amount - a.amount)[0];
  const biggestExpense = filteredMovements
    .filter((item) => item.type === "despesa")
    .sort((a, b) => b.amount - a.amount)[0];
  const topExpenseCategory = filteredMovements.reduce(
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
    {
      delta: incomeDelta,
      kind: "income" as const,
      label: "Entradas",
      value: monthlyTotals.monthlyIncome,
    },
    {
      delta: expenseDelta,
      kind: "expense" as const,
      label: "Despesas",
      value: monthlyTotals.monthlyExpense,
    },
    {
      delta: balanceDelta,
      kind: "result" as const,
      label: "Resultado",
      value: monthBalance,
    },
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

  const mobileListShouldScroll = filteredMovements.length > 4;
  const currentMonthValue = `${yearValue}-${monthValue}`;

  function handleRangeStartChange(value: string) {
    if (!value) {
      setRangeStart("");
      return;
    }

    const normalized = clampDateToMonth(value, monthStartValue, monthEndValue);
    setRangeStart(normalized);
    setRangeEnd((current) => (current && current < normalized ? normalized : current));
  }

  function handleRangeEndChange(value: string) {
    if (!value) {
      setRangeEnd("");
      return;
    }

    const normalized = clampDateToMonth(value, monthStartValue, monthEndValue);
    setRangeEnd(normalized);
    setRangeStart((current) => (current && current > normalized ? normalized : current));
  }

  function clearRange() {
    setRangeStart("");
    setRangeEnd("");
  }

  return (
    <div className="mobile-section-gap">
      <section className="summary-shell overflow-hidden rounded-[32px] p-5 sm:p-6">
        <div className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <Badge className="hero-pill w-fit" variant="secondary">
                <Sparkles className="mr-1 h-3 w-3" />
                Fechamento mensal
              </Badge>
              <div className="space-y-1">
                <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Fechamento de {monthLabel}</h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  Revise o periodo, compare com o anterior e confira os registros usados no fechamento.
                </p>
              </div>
            </div>

            <div className="surface-panel-muted rounded-[24px] px-4 py-3 sm:max-w-[260px]">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Periodo em leitura</p>
              <p className="mt-1 text-sm font-bold text-foreground">{effectivePeriodLabel}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              detail="total do periodo"
              icon={ArrowDownLeft}
              label="Entradas"
              tone="success"
              value={toCurrency(monthlyTotals.monthlyIncome)}
            />
            <MetricCard
              detail="total do periodo"
              icon={ArrowUpRight}
              label="Despesas"
              tone="danger"
              value={toCurrency(monthlyTotals.monthlyExpense)}
            />
            <MetricCard
              detail={monthBalance >= 0 ? "resultado positivo" : "resultado negativo"}
              icon={CalendarRange}
              label="Resultado"
              tone="warning"
              valueTone={monthBalance >= 0 ? "warning" : "danger"}
              value={toCurrency(monthBalance)}
            />
            <MetricCard
              detail={hasCustomRange ? "ate o fim do trecho" : "acumulado ate o fim do mes"}
              icon={Wallet}
              label="Saldo acumulado"
              tone="info"
              valueTone={balanceUntilPeriod >= 0 ? "neutral" : "danger"}
              value={toCurrency(balanceUntilPeriod)}
            />
          </div>
        </div>
      </section>

      <MonthSelector
        currentMonthValue={currentMonthValue}
        monthEndValue={monthEndValue}
        monthStartValue={monthStartValue}
        onClearRange={clearRange}
        onRangeEndChange={handleRangeEndChange}
        onRangeStartChange={handleRangeStartChange}
        rangeEnd={rangeEnd}
        rangeStart={rangeStart}
      />

      <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardContent className="space-y-3 p-5 sm:p-6">
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                Comparacao rapida
              </p>
              <h2 className="text-lg font-extrabold tracking-tight text-foreground">{comparisonLabel}</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                {hasCustomRange
                  ? "Compara exatamente o mesmo trecho de datas no mes anterior."
                  : "Mostra se o fechamento melhorou ou piorou em relacao ao mes anterior."}
              </p>
            </div>

            {comparisonItems.map((item) => (
              <ComparisonRow
                delta={item.delta}
                key={item.label}
                kind={item.kind}
                label={item.label}
                value={toCurrency(item.value)}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5 sm:p-6">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Destaques</p>
              <h2 className="mt-1 text-lg font-extrabold tracking-tight text-foreground">O que mais pesou no periodo</h2>
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
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="surface-panel rounded-[28px] p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  Registros do fechamento
                </p>
                <h2 className="text-lg font-extrabold tracking-tight text-foreground">
                  {filteredMovements.length} registro(s) no periodo
                </h2>
                {mobileListShouldScroll ? (
                  <p className="text-sm leading-6 text-muted-foreground">
                    As movimentacoes mais recentes aparecem primeiro. Role dentro da lista para ver o restante.
                  </p>
                ) : null}
              </div>

              <MovementsCsvExportButton
                buttonClassName="h-10 w-full px-4 text-sm sm:w-auto"
                className="w-full sm:w-auto"
                filename={buildCsvFilename(currentMonthValue, effectiveStart, effectiveEnd, hasCustomRange)}
                label="Exportar CSV"
                movements={filteredMovements}
              />
            </div>
          </div>

          {movements.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-border bg-muted/40 p-5 text-sm leading-6 text-muted-foreground">
              <p className="font-bold text-foreground">Nenhum registro encontrado neste mes.</p>
              <p className="mt-1">Se o periodo estiver certo, adicione entradas e despesas com datas deste mes.</p>
              <Button asChild className="mt-4" size="sm">
                <Link href="/app/movimentacoes">Lancar movimentacao</Link>
              </Button>
            </div>
          ) : filteredMovements.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-border bg-muted/40 p-5 text-sm leading-6 text-muted-foreground">
              <p className="font-bold text-foreground">Nenhum registro encontrado neste intervalo.</p>
              <p className="mt-1">Ajuste as datas ou limpe o intervalo para voltar ao fechamento completo do mes.</p>
              <Button className="mt-4" onClick={clearRange} size="sm" type="button" variant="outline">
                Limpar intervalo
              </Button>
            </div>
          ) : (
            <div
              className={cn(
                "overflow-hidden rounded-[24px] border border-border/70 bg-card",
                mobileListShouldScroll && "max-h-[23rem] overflow-y-auto overscroll-contain md:max-h-none md:overflow-visible",
              )}
            >
              <div className="divide-y divide-border/60">
                {filteredMovements.map((movement) => {
                  const tone = getMovementVisualTone(movement.type);

                  return (
                    <div className="flex gap-3 px-4 py-3.5 transition-colors hover:bg-primary-soft/20 sm:px-5" key={movement.id}>
                      <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl", tone.iconClass)}>
                        {movement.type === "entrada" ? (
                          <ArrowDownLeft className="h-5 w-5" />
                        ) : (
                          <ArrowUpRight className="h-5 w-5" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <Badge className={tone.badgeClass} variant="outline">
                              {tone.label}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {movement.occurred_at ? toDateTime(movement.occurred_at) : toDate(movement.occurred_on)}
                            </span>
                          </div>
                          <p className={cn("font-mono text-sm font-extrabold tabular", tone.amountClass)}>
                            {movement.type === "entrada" ? "+" : "-"} {toCurrency(movement.amount)}
                          </p>
                        </div>
                        <p className="mt-2 truncate text-sm font-bold text-foreground">{movement.description}</p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                          {movement.category}
                        </p>
                      </div>
                    </div>
                  );
                })}
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
  icon: Icon,
  label,
  tone,
  valueTone,
  value,
}: {
  detail: string;
  icon: typeof Receipt;
  label: string;
  tone: "success" | "danger" | "warning" | "info";
  valueTone?: "success" | "danger" | "warning" | "neutral";
  value: string;
}) {
  const resolvedValueTone = valueTone ?? tone;

  return (
    <div
      className={cn(
        "rounded-[24px] border p-4",
        tone === "success" &&
          "border-success/16 bg-[linear-gradient(180deg,hsl(152_60%_96%)_0%,hsl(152_34%_92%)_100%)]",
        tone === "danger" &&
          "border-destructive/16 bg-[linear-gradient(180deg,hsl(0_100%_99%)_0%,hsl(0_82%_95%)_100%)]",
        tone === "warning" &&
          "border-secondary/20 bg-[linear-gradient(180deg,hsl(46_100%_98%)_0%,hsl(40_95%_92%)_100%)]",
        tone === "info" &&
          "border-[hsl(var(--info)/0.18)] bg-[linear-gradient(180deg,hsl(205_100%_98%)_0%,hsl(205_90%_94%)_100%)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={cn(
              "text-[11px] font-bold uppercase tracking-[0.08em]",
              tone === "success" && "text-success/80",
              tone === "danger" && "text-destructive/80",
              tone === "warning" && "text-secondary-foreground/80",
              tone === "info" && "text-[hsl(var(--info))]",
            )}
          >
            {label}
          </p>
          <p
            className={cn(
              "font-mono mt-2 text-xl font-extrabold tabular",
              resolvedValueTone === "success" && "text-success",
              resolvedValueTone === "danger" && "text-destructive",
              resolvedValueTone === "warning" && "text-secondary-foreground",
              resolvedValueTone === "neutral" && "text-foreground",
            )}
          >
            {value}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <div
          className={cn(
            "icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
            tone === "success" && "bg-white/72 text-success",
            tone === "danger" && "bg-white/75 text-destructive",
            tone === "warning" && "bg-white/75 text-secondary-foreground",
            tone === "info" && "bg-white/75 text-[hsl(var(--info))]",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function ComparisonRow({
  delta,
  kind,
  label,
  value,
}: {
  delta: number;
  kind: "income" | "expense" | "result";
  label: string;
  value: string;
}) {
  const positive = delta >= 0;
  const better =
    kind === "expense"
      ? delta <= 0
      : delta >= 0;
  const TrendIcon = better ? TrendingUp : TrendingDown;
  const helperText = `${toCurrency(Math.abs(delta))} ${positive ? "a mais" : "a menos"} que no mes anterior`;

  return (
    <div
      className={cn(
        "rounded-[24px] border p-4",
        better ? "border-success/20 bg-success/10" : "border-destructive/20 bg-destructive/10",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={cn(
              "text-[11px] font-bold uppercase tracking-[0.08em]",
              better ? "text-success/85" : "text-destructive/85",
            )}
          >
            {label}
          </p>
          <p
            className={cn(
              "font-mono mt-2 text-xl font-extrabold tabular",
              better ? "text-success" : "text-destructive",
            )}
          >
            {value}
          </p>
        </div>

        <div
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em]",
            better ? "bg-success/12 text-success" : "bg-destructive/12 text-destructive",
          )}
        >
          <TrendIcon className="h-3 w-3" />
          {better ? "Melhor" : "Pior"}
        </div>
      </div>

      <p className={cn("mt-3 text-sm font-semibold", better ? "text-success" : "text-destructive")}>
        {helperText}
      </p>
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
    <div className="hero-panel-soft rounded-[24px] p-4">
      <div
        className={cn(
          "icon-tile flex h-10 w-10 items-center justify-center rounded-2xl",
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

function clampDateToMonth(value: string, monthStartValue: string, monthEndValue: string) {
  if (value < monthStartValue) {
    return monthStartValue;
  }

  if (value > monthEndValue) {
    return monthEndValue;
  }

  return value;
}

function mapDateToMonth(value: string, targetMonthStartValue: string) {
  const [year, month] = targetMonthStartValue.split("-").map(Number);
  const targetDay = Number(value.slice(-2));
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(targetDay, lastDay)).padStart(2, "0")}`;
}

function buildCsvFilename(
  currentMonthValue: string,
  effectiveStart: string,
  effectiveEnd: string,
  hasCustomRange: boolean,
) {
  if (!hasCustomRange) {
    return `fechoumei-fechamento-${currentMonthValue}.csv`;
  }

  return `fechoumei-fechamento-${currentMonthValue}-${effectiveStart.slice(-2)}-${effectiveEnd.slice(-2)}.csv`;
}
