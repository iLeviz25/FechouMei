"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type MonthSelectorProps = {
  currentMonthValue: string;
  monthEndValue: string;
  monthStartValue: string;
  rangeEnd: string;
  rangeStart: string;
  onClearRange: () => void;
  onRangeEndChange: (value: string) => void;
  onRangeStartChange: (value: string) => void;
};

export function MonthSelector({
  currentMonthValue,
  monthEndValue,
  monthStartValue,
  onClearRange,
  onRangeEndChange,
  onRangeStartChange,
  rangeEnd,
  rangeStart,
}: MonthSelectorProps) {
  const router = useRouter();
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue);
  const [rangePanelOpen, setRangePanelOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const hasCustomRange = rangeStart !== "" || rangeEnd !== "";

  useEffect(() => {
    setSelectedMonth(currentMonthValue);
  }, [currentMonthValue]);

  useEffect(() => {
    if (hasCustomRange) {
      setRangePanelOpen(true);
    }
  }, [hasCustomRange]);

  function handleMonthChange(value: string) {
    setSelectedMonth(value);

    if (!/^\d{4}-\d{2}$/.test(value)) {
      return;
    }

    startTransition(() => {
      router.push(`/app/fechamento-mensal?month=${value}`);
    });
  }

  function shiftMonth(delta: number) {
    const nextMonth = shiftMonthValue(selectedMonth, delta);
    handleMonthChange(nextMonth);
  }

  return (
    <Card className="overflow-hidden rounded-[28px]">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
          <Button
            className="h-11 w-11 rounded-full"
            disabled={isPending}
            onClick={() => shiftMonth(-1)}
            size="icon"
            type="button"
            variant="outline"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="relative min-w-0 rounded-[24px] border border-border/70 bg-white/75 shadow-card">
            <Input
              aria-label="Selecionar periodo"
              className="absolute inset-0 z-10 h-full w-full cursor-pointer border-0 opacity-0 shadow-none focus-visible:ring-0"
              disabled={isPending}
              onChange={(event) => handleMonthChange(event.target.value)}
              type="month"
              value={selectedMonth}
            />
            <div className="pointer-events-none flex min-h-[70px] items-center justify-center gap-2.5 px-4 py-3 text-center">
              <CalendarDays className="h-4.5 w-4.5 shrink-0 text-primary/80" />
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Periodo</p>
                <p className="mt-1 truncate text-lg font-extrabold tracking-tight text-foreground">
                  {formatMonthLabel(selectedMonth)}
                </p>
              </div>
            </div>
          </div>

          <Button
            className="h-11 w-11 rounded-full"
            disabled={isPending}
            onClick={() => shiftMonth(1)}
            size="icon"
            type="button"
            variant="outline"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="surface-panel-muted rounded-[24px] border border-border/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                <CalendarDays className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground">Refinar intervalo</p>
                <p className="text-sm leading-6 text-muted-foreground">
                  Escolha um intervalo de data a data dentro deste mes para recalcular so esse trecho.
                </p>
              </div>
            </div>

            <Button
              className="shrink-0 shadow-sm"
              onClick={() => setRangePanelOpen((current) => !current)}
              size="sm"
              type="button"
              variant="outline"
            >
              <CalendarDays className="h-4 w-4" />
              {rangePanelOpen ? "Fechar" : "Abrir datas"}
            </Button>
          </div>

          {rangePanelOpen ? (
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">De</span>
                  <Input
                    max={rangeEnd || monthEndValue}
                    min={monthStartValue}
                    onChange={(event) => onRangeStartChange(event.target.value)}
                    type="date"
                    value={rangeStart}
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Ate</span>
                  <Input
                    max={monthEndValue}
                    min={rangeStart || monthStartValue}
                    onChange={(event) => onRangeEndChange(event.target.value)}
                    type="date"
                    value={rangeEnd}
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs leading-5 text-muted-foreground">
                  Defina uma data inicial e uma final para ver o fechamento apenas desse intervalo dentro do mes.
                </p>
                {hasCustomRange ? (
                  <Button onClick={onClearRange} size="sm" type="button" variant="ghost">
                    Limpar intervalo
                  </Button>
                ) : (
                  <Badge variant="secondary">Opcional</Badge>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs leading-5 text-muted-foreground">
                {hasCustomRange
                  ? `${toDate(rangeStart || monthStartValue)} a ${toDate(rangeEnd || monthEndValue)}`
                  : "Clique em Abrir datas para escolher um periodo de um dia ate outro dentro do mes."}
              </p>
              {hasCustomRange ? <Badge variant="success">Intervalo ativo</Badge> : <Badge variant="secondary">Opcional</Badge>}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function shiftMonthValue(currentMonthValue: string, delta: number) {
  if (!/^\d{4}-\d{2}$/.test(currentMonthValue)) {
    return currentMonthValue;
  }

  const [year, month] = currentMonthValue.split("-").map(Number);
  const nextDate = new Date(year, month - 1 + delta, 1);
  return `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`;
}

function toDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function formatMonthLabel(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return value;
  }

  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}
