"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarDays } from "lucide-react";
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
  const [isPending, startTransition] = useTransition();
  const hasCustomRange = rangeStart !== "" || rangeEnd !== "";

  useEffect(() => {
    setSelectedMonth(currentMonthValue);
  }, [currentMonthValue]);

  function handleMonthChange(value: string) {
    setSelectedMonth(value);

    if (!/^\d{4}-\d{2}$/.test(value)) {
      return;
    }

    startTransition(() => {
      router.push(`/app/fechamento-mensal?month=${value}`);
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5 sm:p-6">
        <div className="space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Periodo</p>
          <h2 className="text-lg font-extrabold tracking-tight text-foreground">Escolha o fechamento</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Selecione o mes e, se quiser, refine por um trecho especifico dentro dele.
          </p>
        </div>

        <label className="block space-y-2">
          <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Mes do fechamento</span>
          <Input
            disabled={isPending}
            onChange={(event) => handleMonthChange(event.target.value)}
            type="month"
            value={selectedMonth}
          />
        </label>

        <div className="surface-panel-muted rounded-[24px] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="icon-tile flex h-9 w-9 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                  <CalendarDays className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">Intervalo no mes</p>
                  <p className="text-sm leading-6 text-muted-foreground">Opcional para ver so um trecho do fechamento.</p>
                </div>
              </div>
            </div>

            {hasCustomRange ? (
              <Button onClick={onClearRange} size="sm" type="button" variant="ghost">
                Limpar intervalo
              </Button>
            ) : (
              <Badge variant="secondary">Opcional</Badge>
            )}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
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

          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Exemplo: veja apenas do dia 17 ao dia 23 dentro do mes escolhido.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
