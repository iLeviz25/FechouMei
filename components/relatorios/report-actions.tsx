"use client";

import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { MovementsCsvExportButton } from "@/components/app/movements-csv-export-button";
import { ReportPrintButton } from "@/components/relatorios/report-print-button";
import type { ReportMovement } from "@/lib/relatorios/types";

type ReportActionsProps = {
  monthValue: string;
  movements: ReportMovement[];
};

export function ReportActions({ monthValue, movements }: ReportActionsProps) {
  const router = useRouter();

  function handleMonthChange(value: string) {
    if (!value) {
      return;
    }

    router.push(`/app/relatorios?month=${value}`);
  }

  return (
    <div className="print:hidden">
      <div className="surface-panel-ghost flex flex-col gap-3 rounded-[26px] p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <label className="flex min-w-0 flex-1 items-center gap-3 rounded-[20px] bg-white px-3 py-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <CalendarDays className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Mes de referencia
            </span>
            <input
              className="mt-1 w-full min-w-0 bg-transparent text-base font-extrabold text-foreground outline-none"
              onChange={(event) => handleMonthChange(event.target.value)}
              type="month"
              value={monthValue}
            />
          </span>
        </label>

        <div className="grid gap-2 sm:flex sm:shrink-0 sm:items-center">
          <ReportPrintButton />
          <MovementsCsvExportButton
            buttonClassName="w-full sm:w-auto"
            className="sm:min-w-[10rem]"
            filename={`relatorio-fechoumei-${monthValue}.csv`}
            label="Exportar CSV"
            movements={movements}
          />
        </div>
      </div>

    </div>
  );
}
