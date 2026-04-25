"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReportMovement } from "@/lib/relatorios/types";

type ReportTransactionsListProps = {
  movements: ReportMovement[];
};

const INITIAL_VISIBLE_COUNT = 15;
const VISIBLE_INCREMENT = 15;

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency",
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
});

export function ReportTransactionsList({ movements }: ReportTransactionsListProps) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const visibleMovements = movements.slice(0, visibleCount);
  const hasMore = visibleCount < movements.length;

  if (movements.length === 0) {
    return (
      <div className="px-5 py-8 text-center text-sm font-semibold text-muted-foreground print:px-0">
        Nenhuma movimentacao registrada neste mes.
      </div>
    );
  }

  return (
    <>
      <div className="print:hidden">
        <ScreenMovementsTable movements={visibleMovements} />
        <ScreenMovementsCards movements={visibleMovements} />

        <div className="flex flex-col gap-3 border-t border-border/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-muted-foreground">
            Mostrando {visibleMovements.length} de {movements.length} movimentacoes
          </p>
          {hasMore ? (
            <Button
              className="w-full sm:w-auto"
              onClick={() => setVisibleCount((current) => Math.min(current + VISIBLE_INCREMENT, movements.length))}
              type="button"
              variant="outline"
            >
              Ver mais movimentacoes
            </Button>
          ) : null}
        </div>
      </div>

      <PrintMovementsTable movements={movements} />
    </>
  );
}

function ScreenMovementsTable({ movements }: { movements: ReportMovement[] }) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border/70 bg-muted/35 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <th className="px-5 py-3 font-bold">Data</th>
            <th className="px-5 py-3 font-bold">Descricao</th>
            <th className="px-5 py-3 font-bold">Tipo</th>
            <th className="px-5 py-3 font-bold">Categoria</th>
            <th className="px-5 py-3 text-right font-bold">Valor</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((movement) => (
            <tr className="border-b border-border/60 last:border-b-0" key={movement.id}>
              <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                {toDate(movement.occurred_on)}
              </td>
              <td className="px-5 py-3 font-semibold text-foreground">{movement.description}</td>
              <td className="px-5 py-3">
                <MovementBadge type={movement.type} />
              </td>
              <td className="px-5 py-3 text-muted-foreground">{movement.category}</td>
              <td className={cn("whitespace-nowrap px-5 py-3 text-right font-mono font-extrabold tabular", amountClass(movement.type))}>
                {movement.type === "entrada" ? "+" : "-"} {toCurrency(movement.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScreenMovementsCards({ movements }: { movements: ReportMovement[] }) {
  return (
    <div className="divide-y divide-border/70 md:hidden">
      {movements.map((movement) => (
        <div className="px-5 py-4" key={movement.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-foreground">{movement.description}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {toDate(movement.occurred_on)} . {movement.category}
              </p>
            </div>
            <p className={cn("whitespace-nowrap font-mono text-sm font-extrabold tabular", amountClass(movement.type))}>
              {movement.type === "entrada" ? "+" : "-"} {toCurrency(movement.amount)}
            </p>
          </div>
          <div className="mt-3">
            <MovementBadge type={movement.type} />
          </div>
        </div>
      ))}
    </div>
  );
}

function PrintMovementsTable({ movements }: { movements: ReportMovement[] }) {
  return (
    <div className="hidden print:block print:w-full print:overflow-visible">
      <table className="report-print-table w-full table-fixed border-collapse text-left text-[9px] leading-tight">
        <colgroup>
          <col className="w-[13%]" />
          <col className="w-[34%]" />
          <col className="w-[12%]" />
          <col className="w-[20%]" />
          <col className="w-[21%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-border text-[8px] uppercase tracking-[0.08em] text-muted-foreground">
            <th className="px-1.5 py-2 font-bold">Data</th>
            <th className="px-1.5 py-2 font-bold">Descricao</th>
            <th className="px-1.5 py-2 font-bold">Tipo</th>
            <th className="px-1.5 py-2 font-bold">Categoria</th>
            <th className="px-1.5 py-2 text-right font-bold">Valor</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((movement) => (
            <tr className="border-b border-border/70" key={movement.id}>
              <td className="whitespace-nowrap px-1.5 py-1.5 text-muted-foreground">
                {toDate(movement.occurred_on)}
              </td>
              <td className="break-words px-1.5 py-1.5 font-semibold text-foreground">
                {movement.description}
              </td>
              <td className="px-1.5 py-1.5 text-muted-foreground">
                {movement.type === "entrada" ? "Entrada" : "Despesa"}
              </td>
              <td className="break-words px-1.5 py-1.5 text-muted-foreground">{movement.category}</td>
              <td className={cn("report-print-value px-1.5 py-1.5 text-right font-mono font-extrabold tabular", amountClass(movement.type))}>
                {movement.type === "entrada" ? "+" : "-"} {toCurrency(movement.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MovementBadge({ type }: { type: ReportMovement["type"] }) {
  const income = type === "entrada";

  return (
    <Badge
      className={cn(
        "border-0 shadow-none",
        income ? "bg-primary-soft text-primary" : "bg-destructive/10 text-destructive",
      )}
    >
      {income ? "Entrada" : "Despesa"}
    </Badge>
  );
}

function amountClass(type: ReportMovement["type"]) {
  return type === "entrada" ? "text-primary" : "text-destructive";
}

function toCurrency(value: number) {
  return currencyFormatter.format(value);
}

function toDate(value: string) {
  return dateFormatter.format(new Date(`${value}T00:00:00Z`));
}
