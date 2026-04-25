"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Flame,
  Sparkles,
  Tag,
  TrendingDown,
  TrendingUp,
  Trophy,
  Wallet,
  type LucideIcon,
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
  trendRows: BalanceMovement[];
  yearValue: string;
};

type HighlightTone = "success" | "danger" | "warning";
type SummaryTone = "success" | "danger" | "neutral";
type TrendItem = {
  current: boolean;
  height: number;
  key: string;
  label: string;
  value: number;
};

type DeltaInfo = {
  hasBase: boolean;
  label: string;
  positive: boolean;
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

function toShortDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  })
    .format(new Date(`${value}T00:00:00Z`))
    .replace(".", "");
}

function toCompactCurrency(value: number) {
  const absolute = Math.abs(value);

  if (absolute >= 1000) {
    return `${value < 0 ? "-" : ""}R$ ${(absolute / 1000).toFixed(1).replace(".", ",")}k`;
  }

  return `${value < 0 ? "-" : ""}${toCurrency(absolute)}`;
}

function formatCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatSignedCurrency(value: number) {
  const prefix = value >= 0 ? "+ " : "- ";
  return `${prefix}${toCurrency(Math.abs(value))}`;
}

function getDeltaInfo(current: number, previous: number): DeltaInfo {
  if (current === 0 && previous === 0) {
    return { hasBase: true, label: "0%", positive: true };
  }

  if (previous === 0) {
    return { hasBase: false, label: "Sem base anterior", positive: current >= 0 };
  }

  if (previous < 0 && current >= 0) {
    return { hasBase: true, label: "Virou positivo", positive: true };
  }

  const delta = ((current - previous) / Math.abs(previous)) * 100;
  const rounded = Math.abs(delta) >= 100 ? delta.toFixed(0) : delta.toFixed(1);
  const positive = previous < 0 ? current >= previous : current >= previous;

  return {
    hasBase: true,
    label: `${delta >= 0 ? "+" : ""}${rounded.replace(".", ",")}%`,
    positive,
  };
}

function toCategoryDisplay(value: string) {
  return value
    .toLowerCase()
    .split(/[\s_-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatMonthHeaderLabel(yearValue: string, monthValue: string) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })
    .format(new Date(Number(yearValue), Number(monthValue) - 1, 1))
    .replace(" de ", "/");
}

function buildTrendItems(rows: BalanceMovement[], currentMonthValue: string) {
  const [year, month] = currentMonthValue.split("-").map(Number);
  const monthKeys = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(year, month - 1 - (5 - index), 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });

  const totalsByMonth = monthKeys.reduce<Record<string, number>>((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});

  rows.forEach((movement) => {
    const key = movement.occurred_on.slice(0, 7);

    if (!(key in totalsByMonth)) {
      return;
    }

    totalsByMonth[key] += movement.type === "entrada" ? movement.amount : movement.amount * -1;
  });

  const maxMagnitude = Math.max(...Object.values(totalsByMonth).map((value) => Math.abs(value)), 1);

  return monthKeys.map((key) => {
    const [itemYear, itemMonth] = key.split("-").map(Number);
    const label = new Intl.DateTimeFormat("pt-BR", { month: "short" })
      .format(new Date(itemYear, itemMonth - 1, 1))
      .replace(".", "")
      .slice(0, 3)
      .toUpperCase();

    return {
      current: key === currentMonthValue,
      height:
        totalsByMonth[key] === 0
          ? 8
          : Math.max(18, Math.round((Math.abs(totalsByMonth[key]) / maxMagnitude) * 100)),
      key,
      label,
      value: totalsByMonth[key],
    } satisfies TrendItem;
  });
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
  trendRows,
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
  const comparisonLabel = hasCustomRange ? "Mesmo trecho no mes anterior" : "Vs. mes anterior";

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
            acc.incomeCount += 1;
          } else {
            acc.monthlyExpense += movement.amount;
            acc.expenseCount += 1;
          }

          return acc;
        },
        { expenseCount: 0, incomeCount: 0, monthlyExpense: 0, monthlyIncome: 0 },
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

  const topCategoryShare =
    monthlyTotals.monthlyExpense > 0 && topExpenseCategory.top
      ? (topExpenseCategory.top.amount / monthlyTotals.monthlyExpense) * 100
      : 0;
  const trendItems = useMemo(
    () => buildTrendItems(trendRows, `${yearValue}-${monthValue}`),
    [monthValue, trendRows, yearValue],
  );

  const balanceDeltaInfo = getDeltaInfo(monthBalance, previousBalance);
  const incomeDeltaInfo = getDeltaInfo(monthlyTotals.monthlyIncome, previousTotals.monthlyIncome);
  const expenseDeltaInfo = getDeltaInfo(monthlyTotals.monthlyExpense, previousTotals.monthlyExpense);
  const heroTrendPositive = balanceDeltaInfo.positive;
  const heroTrendText = balanceDeltaInfo.hasBase
    ? `${balanceDeltaInfo.label} ${comparisonLabel.toLowerCase()}`
    : balanceDeltaInfo.label;
  const highlightItems = [
    {
      icon: Trophy,
      label: "Maior entrada",
      meta: biggestIncome
        ? `${toCategoryDisplay(biggestIncome.category)} · ${toShortDate(biggestIncome.occurred_on)}`
        : "Nenhuma entrada registrada",
      title: biggestIncome ? biggestIncome.description : "Sem entradas no periodo",
      tone: "success" as const,
      value: biggestIncome ? toCurrency(biggestIncome.amount) : "R$ 0,00",
    },
    {
      icon: Flame,
      label: "Maior despesa",
      meta: biggestExpense
        ? `${toCategoryDisplay(biggestExpense.category)} · ${toShortDate(biggestExpense.occurred_on)}`
        : "Nenhuma despesa registrada",
      title: biggestExpense ? biggestExpense.description : "Sem despesas no periodo",
      tone: "danger" as const,
      value: biggestExpense ? toCurrency(biggestExpense.amount) : "R$ 0,00",
    },
    {
      icon: Tag,
      label: "Categoria top em gastos",
      meta: topExpenseCategory.top ? `${topCategoryShare.toFixed(0)}% das despesas` : "Nenhuma despesa registrada",
      title: topExpenseCategory.top ? toCategoryDisplay(topExpenseCategory.top.category) : "Sem despesas no periodo",
      tone: "warning" as const,
      value: topExpenseCategory.top ? toCurrency(topExpenseCategory.top.amount) : "R$ 0,00",
    },
  ];

  const mobileListShouldScroll = filteredMovements.length > 4;
  const currentMonthValue = `${yearValue}-${monthValue}`;
  const currentMonthHeaderLabel = formatMonthHeaderLabel(yearValue, monthValue);

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
      <header className="space-y-3">
        <Badge className="w-fit" variant="success">
          <Sparkles className="mr-1 h-3 w-3" />
          Visao consolidada
        </Badge>
        <div className="max-w-2xl space-y-1.5">
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">Fechamento mensal</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Veja como foi o seu mes, compare com o anterior e acompanhe o saldo do seu MEI.
          </p>
        </div>
      </header>

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

      <section className="space-y-4">
        <div className="overflow-hidden rounded-[30px] bg-[linear-gradient(180deg,hsl(155_62%_35%)_0%,hsl(160_70%_28%)_100%)] px-4 py-4 text-white shadow-elevated sm:px-5 sm:py-5">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-white/10 bg-white/14 text-white shadow-none" variant="outline">
                {hasCustomRange ? "Resultado do trecho" : "Resultado do mes"}
              </Badge>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/78">
                {hasCustomRange
                  ? `${formatCount(filteredMovements.length, "lancamento", "lancamentos")} no trecho`
                  : `${formatCount(filteredMovements.length, "lancamento", "lancamentos")} em ${monthLabel}`}
              </span>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/68">
                {hasCustomRange ? effectivePeriodLabel : "Resultado do mes"}
              </p>
              <p
                className={cn(
                  "font-mono text-[clamp(2.05rem,9vw,3.45rem)] font-extrabold leading-none tracking-tight",
                  monthBalance >= 0 ? "text-white" : "text-[hsl(38_100%_72%)]",
                )}
              >
                {formatSignedCurrency(monthBalance)}
              </p>
              {monthBalance < 0 ? (
                <Badge className="border-white/10 bg-white/14 text-[hsl(38_100%_78%)] shadow-none" variant="outline">
                  Resultado negativo
                </Badge>
              ) : null}
              <p className="text-sm leading-6 text-white/76">
                {hasCustomRange ? effectivePeriodLabel : `${currentMonthHeaderLabel} • fechamento consolidado do periodo`}
              </p>
            </div>

            <div className="space-y-3">
              <div
                className={cn(
                  "inline-flex w-fit items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold",
                  heroTrendPositive ? "bg-white/12 text-white" : "bg-white/10 text-white",
                )}
              >
                {heroTrendPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                {heroTrendText}
              </div>

              <div className="grid grid-cols-6 items-end gap-1.5 rounded-[24px] bg-white/6 p-2.5">
                {trendItems.map((item) => (
                  <div className="flex flex-col items-center gap-2" key={item.key}>
                    <div className="flex h-12 w-full items-end rounded-[16px] bg-white/8 p-1 sm:h-14">
                      <div
                        className={cn(
                          "w-full rounded-[14px]",
                          item.current
                            ? item.value >= 0
                              ? "bg-[linear-gradient(180deg,hsl(40_100%_62%)_0%,hsl(36_100%_56%)_100%)]"
                              : "bg-[linear-gradient(180deg,hsl(358_92%_74%)_0%,hsl(358_75%_58%)_100%)]"
                            : item.value >= 0
                              ? "bg-white/60"
                              : "bg-destructive/70",
                        )}
                        style={{ height: `${item.height}%` }}
                      />
                    </div>
                    <span
                      className={cn(
                        "text-[10px] font-bold uppercase tracking-[0.08em]",
                        item.current ? "text-[hsl(40_100%_72%)]" : "text-white/70",
                      )}
                    >
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 lg:grid-cols-3">
          <SummaryStatCard
            detail={formatCount(monthlyTotals.incomeCount, "lancamento", "lancamentos")}
            icon={ArrowDownLeft}
            label="Entradas"
            tone="success"
            trendGood={incomeDelta >= 0}
            trendText={incomeDeltaInfo.label}
            value={toCurrency(monthlyTotals.monthlyIncome)}
          />
          <SummaryStatCard
            detail={formatCount(monthlyTotals.expenseCount, "lancamento", "lancamentos")}
            icon={ArrowUpRight}
            label="Despesas"
            tone="danger"
            trendGood={expenseDelta <= 0}
            trendText={expenseDeltaInfo.label}
            value={toCurrency(monthlyTotals.monthlyExpense)}
          />
          <SummaryStatCard
            className="min-[430px]:col-span-2 lg:col-span-1"
            detail={hasCustomRange ? `ate ${toDate(effectiveEnd)}` : `ate ${monthLabel}`}
            icon={Wallet}
            label="Saldo acumulado"
            tone="neutral"
            value={toCurrency(balanceUntilPeriod)}
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3 px-1">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Destaques do mes</p>
            <h2 className="mt-1 text-lg font-extrabold tracking-tight text-foreground">O que mais puxou o fechamento</h2>
          </div>
          <p className="text-xs font-semibold text-muted-foreground">{currentMonthHeaderLabel}</p>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          {highlightItems.map((item) => (
            <HighlightCard
              icon={item.icon}
              key={item.label}
              label={item.label}
              meta={item.meta}
              title={item.title}
              tone={item.tone}
              value={item.value}
            />
          ))}
        </div>
      </section>

      <Card className="overflow-hidden rounded-[32px]">
        <CardContent className="p-0">
          <div className="border-b border-border/60 px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  Registros do fechamento
                </p>
                <h2 className="text-lg font-extrabold tracking-tight text-foreground">
                  {formatCount(filteredMovements.length, "registro", "registros")} no periodo
                </h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  {mobileListShouldScroll
                    ? "A lista fica contida aqui e mostra as mais recentes primeiro. Role dentro da caixa para ver o restante."
                    : "Todos os registros usados neste fechamento aparecem aqui."}
                </p>
              </div>

              <MovementsCsvExportButton
                buttonClassName="h-9 w-full rounded-full px-4 text-xs sm:w-auto"
                className="w-full sm:w-auto"
                filename={buildCsvFilename(currentMonthValue, effectiveStart, effectiveEnd, hasCustomRange)}
                label="CSV"
                movements={filteredMovements}
              />
            </div>
          </div>

          {movements.length === 0 ? (
            <div className="px-4 py-5 sm:px-6">
              <div className="rounded-[24px] border border-dashed border-border bg-muted/40 p-5 text-sm leading-6 text-muted-foreground">
                <p className="font-bold text-foreground">Nenhum registro encontrado neste mes.</p>
                <p className="mt-1">Se o periodo estiver certo, adicione entradas e despesas com datas deste mes.</p>
                <Button asChild className="mt-4" size="sm">
                  <Link href="/app/movimentacoes">Lancar movimentacao</Link>
                </Button>
              </div>
            </div>
          ) : filteredMovements.length === 0 ? (
            <div className="px-4 py-5 sm:px-6">
              <div className="rounded-[24px] border border-dashed border-border bg-muted/40 p-5 text-sm leading-6 text-muted-foreground">
                <p className="font-bold text-foreground">Nenhum registro encontrado neste intervalo.</p>
                <p className="mt-1">Ajuste as datas ou limpe o intervalo para voltar ao fechamento completo do mes.</p>
                <Button className="mt-4" onClick={clearRange} size="sm" type="button" variant="outline">
                  Limpar intervalo
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="px-4 py-4 sm:px-6">
                <div
                  className={cn(
                    "overflow-hidden rounded-[24px] border border-border/70 bg-card",
                    mobileListShouldScroll && "max-h-[27rem] overflow-y-auto overscroll-contain md:max-h-none md:overflow-visible",
                  )}
                >
                  <div className="divide-y divide-border/60">
                    {filteredMovements.map((movement) => {
                      const tone = getMovementVisualTone(movement.type);

                      return (
                        <div className="flex gap-3 px-4 py-3 transition-colors hover:bg-primary-soft/20 sm:px-5 sm:py-3.5" key={movement.id}>
                          <div
                            className={cn(
                              "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                              tone.iconClass,
                            )}
                          >
                            {movement.type === "entrada" ? (
                              <ArrowDownLeft className="h-5 w-5" />
                            ) : (
                              <ArrowUpRight className="h-5 w-5" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-foreground">{movement.description}</p>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  <Badge className={tone.badgeClass} variant="outline">
                                    {tone.label}
                                  </Badge>
                                  <span className="rounded-full bg-muted/65 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                                    {toCategoryDisplay(movement.category)}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {movement.occurred_at ? toDateTime(movement.occurred_at) : toShortDate(movement.occurred_on)}
                                  </span>
                                </div>
                              </div>
                              <p className={cn("shrink-0 pl-2 font-mono text-sm font-extrabold tabular", tone.amountClass)}>
                                {movement.type === "entrada" ? "+" : "-"} {toCurrency(movement.amount)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 border-t border-border/60 bg-muted/15">
                <FooterSummaryCell label="Entradas" tone="success" value={toCompactCurrency(monthlyTotals.monthlyIncome)} />
                <FooterSummaryCell label="Despesas" tone="danger" value={toCompactCurrency(monthlyTotals.monthlyExpense)} />
                <FooterSummaryCell label="Resultado" tone={monthBalance >= 0 ? "success" : "neutral"} value={toCompactCurrency(monthBalance)} />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryStatCard({
  className,
  detail,
  icon: Icon,
  label,
  tone,
  trendGood,
  trendText,
  value,
}: {
  className?: string;
  detail: string;
  icon: LucideIcon;
  label: string;
  tone: SummaryTone;
  trendGood?: boolean;
  trendText?: string;
  value: string;
}) {
  return (
    <Card
      className={cn(
        "overflow-hidden rounded-[26px] border shadow-none",
        tone === "success" &&
          "border-primary/14 bg-[linear-gradient(180deg,hsl(152_60%_97%)_0%,hsl(152_36%_93%)_100%)]",
        tone === "danger" &&
          "border-destructive/16 bg-[linear-gradient(180deg,hsl(0_100%_99%)_0%,hsl(0_82%_96%)_100%)]",
        tone === "neutral" &&
          "border-border/80 bg-[linear-gradient(180deg,hsl(0_0%_100%)_0%,hsl(150_20%_96%)_100%)]",
        className,
      )}
    >
      <CardContent className="relative p-4 pr-14 sm:p-5 sm:pr-16">
        <div
          className={cn(
            "icon-tile absolute right-4 top-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl sm:right-5 sm:top-5 sm:h-11 sm:w-11",
            tone === "success" && "bg-white/72 text-primary",
            tone === "danger" && "bg-white/78 text-destructive",
            tone === "neutral" && "bg-white/80 text-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>

        <div className="min-w-0">
          <p
            className={cn(
              "text-[11px] font-bold uppercase tracking-[0.08em]",
              tone === "success" && "text-primary/82",
              tone === "danger" && "text-destructive/82",
              tone === "neutral" && "text-foreground/58",
            )}
          >
            {label}
          </p>
          <p
            className={cn(
              "mt-2 max-w-full whitespace-nowrap font-mono text-[clamp(1.05rem,4.1vw,1.75rem)] font-extrabold leading-none tracking-tight",
              tone === "success" && "text-primary",
              tone === "danger" && "text-destructive",
              tone === "neutral" && "text-foreground",
            )}
          >
            {value}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground">{detail}</p>
            {trendText ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em]",
                  trendGood ? "bg-primary/12 text-primary" : "bg-destructive/12 text-destructive",
                )}
              >
                {trendGood ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {trendText}
              </span>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HighlightCard({
  icon: Icon,
  label,
  meta,
  title,
  tone,
  value,
}: {
  icon: LucideIcon;
  label: string;
  meta: string;
  title: string;
  tone: HighlightTone;
  value: string;
}) {
  return (
    <Card className="overflow-hidden rounded-[28px]">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "icon-tile flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
              tone === "success" && "bg-primary/10 text-primary",
              tone === "danger" && "bg-destructive/10 text-destructive",
              tone === "warning" && "bg-secondary-soft text-secondary-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
          </div>

          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
            <p className="mt-1 truncate text-base font-bold text-foreground">{title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{meta}</p>
            <p
              className={cn(
                "mt-4 font-mono text-[1.65rem] font-extrabold leading-none tracking-tight",
                tone === "success" && "text-primary",
                tone === "danger" && "text-foreground",
                tone === "warning" && "text-foreground",
              )}
            >
              {value}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FooterSummaryCell({
  label,
  tone,
  value,
}: {
  label: string;
  tone: SummaryTone;
  value: string;
}) {
  return (
    <div className="border-r border-border/60 px-3 py-3 text-center last:border-r-0">
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-mono text-sm font-extrabold tabular",
          tone === "success" && "text-primary",
          tone === "danger" && "text-destructive",
          tone === "neutral" && "text-foreground",
        )}
      >
        {value}
      </p>
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
