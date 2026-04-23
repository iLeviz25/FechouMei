"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CheckCircle2, Loader2 } from "lucide-react";
import { toggleChecklistItem } from "@/app/app/obrigacoes/actions";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ChecklistItem = {
  key: string;
  label: string;
  done: boolean;
};

type ChecklistStatus =
  | { kind: "error"; message: string }
  | { kind: "saving"; message: string }
  | { kind: "success"; message: string };

type ChecklistFilter = "all" | "pending" | "done";

type ObrigacoesChecklistProps = {
  items: ChecklistItem[];
  monthKey: string;
};

type EnrichedChecklistItem = ChecklistItem & {
  category: string;
  dateLabel: string;
  dateTone: "danger" | "neutral" | "success" | "warning";
  description: string;
  priorityLabel?: string;
  title: string;
};

type MonthInfo = {
  declarationYear: number;
  monthDate: Date;
  monthEndDate: Date;
  monthKey: string;
  monthLabel: string;
  nextReviewDate: Date;
  year: number;
};

const filterOptions: Array<{ label: string; value: ChecklistFilter }> = [
  { label: "Todas", value: "all" },
  { label: "Pendentes", value: "pending" },
  { label: "Concluidas", value: "done" },
];

export function ObrigacoesChecklist({ items, monthKey }: ObrigacoesChecklistProps) {
  const router = useRouter();
  const [localItems, setLocalItems] = useState(items);
  const [pendingKeys, setPendingKeys] = useState<string[]>([]);
  const [status, setStatus] = useState<ChecklistStatus | null>(null);
  const [activeFilter, setActiveFilter] = useState<ChecklistFilter>("all");
  const confirmedItemsRef = useRef(items);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    confirmedItemsRef.current = items;
    setLocalItems(items);
    setPendingKeys([]);
    setStatus(null);
  }, [items]);

  useEffect(
    () => () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    },
    [],
  );

  const monthInfo = useMemo(() => createMonthInfo(monthKey), [monthKey]);

  const enrichedItems = useMemo(
    () => localItems.map((item) => enrichChecklistItem(item, monthInfo)),
    [localItems, monthInfo],
  );

  const filterCounts = useMemo(
    () => ({
      all: enrichedItems.length,
      done: enrichedItems.filter((item) => item.done).length,
      pending: enrichedItems.filter((item) => !item.done).length,
    }),
    [enrichedItems],
  );

  const filteredItems = useMemo(() => {
    if (activeFilter === "done") {
      return enrichedItems.filter((item) => item.done);
    }

    if (activeFilter === "pending") {
      return enrichedItems.filter((item) => !item.done);
    }

    return enrichedItems;
  }, [activeFilter, enrichedItems]);

  function handleToggle(item: ChecklistItem) {
    if (pendingKeys.includes(item.key)) {
      return;
    }

    const nextDone = !item.done;

    setLocalItems((current) => updateItemState(current, item.key, nextDone));
    setPendingKeys((current) => [...current, item.key]);
    setStatus({ kind: "saving", message: "Salvando atualizacao..." });

    void persistChecklistItem(item.key, nextDone);
  }

  async function persistChecklistItem(itemKey: string, done: boolean) {
    const result = await toggleChecklistItem({
      itemKey,
      done,
      monthKey,
    });

    let shouldRefresh = false;

    setPendingKeys((current) => {
      const next = current.filter((key) => key !== itemKey);
      shouldRefresh = next.length === 0;
      return next;
    });

    if (!result.ok) {
      const previousItem = confirmedItemsRef.current.find((item) => item.key === itemKey);

      setLocalItems((current) => updateItemState(current, itemKey, previousItem?.done ?? false));
      setStatus({
        kind: "error",
        message: result.message,
      });

      return;
    }

    confirmedItemsRef.current = updateItemState(confirmedItemsRef.current, itemKey, done);
    setStatus({
      kind: "success",
      message: result.message,
    });

    if (shouldRefresh) {
      scheduleRefresh();
    }
  }

  function scheduleRefresh() {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    refreshTimeoutRef.current = setTimeout(() => {
      router.refresh();
      refreshTimeoutRef.current = null;
    }, 350);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 min-[430px]:flex-row min-[430px]:items-center min-[430px]:justify-between">
        <p className="text-sm leading-6 text-muted-foreground">Filtre o checklist sem perder a marcacao real dos itens.</p>

        <div className="inline-flex w-full flex-wrap rounded-full border border-border/70 bg-muted/30 p-1 min-[430px]:w-auto">
          {filterOptions.map((option) => {
            const count = filterCounts[option.value];

            return (
              <button
                className={cn(
                  "flex-1 rounded-full px-3 py-2 text-xs font-bold transition-colors min-[430px]:flex-none",
                  activeFilter === option.value
                    ? "bg-white text-foreground shadow-card"
                    : "text-muted-foreground hover:text-foreground",
                )}
                key={option.value}
                onClick={() => setActiveFilter(option.value)}
                type="button"
              >
                {option.label} <span className="text-muted-foreground">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        {filteredItems.map((item) => {
          const disabled = pendingKeys.includes(item.key);

          return (
            <button
              className={cn(
                "flex w-full items-start gap-3 rounded-[24px] border px-4 py-4 text-left transition-all",
                item.done
                  ? "border-success/18 bg-[linear-gradient(180deg,hsl(152_54%_97%),hsl(152_30%_94%))] text-muted-foreground"
                  : "surface-panel-muted text-foreground hover:-translate-y-0.5 hover:border-primary/20 hover:bg-primary-soft/20",
                disabled && "opacity-80",
              )}
              key={item.key}
              onClick={() => handleToggle(item)}
              type="button"
            >
              <span
                className={cn(
                  "mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  item.done ? "border-success bg-success text-success-foreground" : "border-border bg-white",
                )}
              >
                {item.done ? <CheckCircle2 className="h-4 w-4" /> : null}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className={cn("text-base font-extrabold tracking-tight text-foreground", item.done && "line-through")}>
                    {item.title}
                  </span>
                  {item.priorityLabel ? (
                    <Badge className="border-destructive/12 bg-destructive/10 text-destructive" variant="outline">
                      {item.priorityLabel}
                    </Badge>
                  ) : null}
                </span>

                <span className="mt-1 block text-sm leading-6 text-muted-foreground">{item.description}</span>

                <span className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge
                    className={cn(
                      item.done
                        ? "border-success/15 bg-success/10 text-success"
                        : "border-border/70 bg-white/88 text-muted-foreground",
                    )}
                    variant="outline"
                  >
                    {item.done ? "Concluida" : "Pendente"}
                  </Badge>

                  <span className="rounded-full bg-muted/70 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    {item.category}
                  </span>

                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                      item.dateTone === "success" && "bg-success/10 text-success",
                      item.dateTone === "warning" && "bg-secondary-soft text-secondary-foreground",
                      item.dateTone === "danger" && "bg-destructive/10 text-destructive",
                      item.dateTone === "neutral" && "bg-white text-muted-foreground",
                    )}
                  >
                    <CalendarDays className="h-3 w-3" />
                    {item.dateLabel}
                  </span>
                </span>
              </span>

              {disabled ? <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin text-muted-foreground" /> : null}
            </button>
          );
        })}
      </div>

      {filteredItems.length === 0 ? (
        <p className="text-sm font-semibold text-muted-foreground">Nenhum item neste filtro agora.</p>
      ) : null}

      {status ? (
        <p className={cn("text-xs font-semibold", status.kind === "error" ? "text-destructive" : "text-muted-foreground")} role="status">
          {status.message}
        </p>
      ) : null}
    </div>
  );
}

function createMonthInfo(monthKey: string): MonthInfo {
  const [year, month] = monthKey.split("-").map(Number);
  const monthDate = new Date(year, month - 1, 1);
  const monthEndDate = new Date(year, month, 0);

  return {
    declarationYear: year - 1,
    monthDate,
    monthEndDate,
    monthKey,
    monthLabel: new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(monthDate),
    nextReviewDate: new Date(year, month, 3),
    year,
  };
}

function enrichChecklistItem(item: ChecklistItem, monthInfo: MonthInfo): EnrichedChecklistItem {
  const monthTitle = capitalizeMonthLabel(monthInfo.monthLabel);
  const base = {
    category: "Rotina",
    dateLabel: formatShortDate(monthInfo.monthEndDate),
    dateTone: getDateTone(item.done, monthInfo.monthEndDate),
    description: item.label,
    title: item.label,
  };

  if (item.key === "pagar-das") {
    const dueDate = new Date(monthInfo.monthDate.getFullYear(), monthInfo.monthDate.getMonth(), 20);

    return {
      ...item,
      category: "Imposto",
      dateLabel: formatShortDate(dueDate),
      dateTone: getDateTone(item.done, dueDate),
      description: "Documento de Arrecadacao do Simples Nacional",
      priorityLabel: "Importante",
      title: `Pagar DAS - ${monthTitle.replace(" de ", "/")}`,
    };
  }

  if (item.key === "entregar-dasn") {
    const dueDate = new Date(monthInfo.year, 4, 31);

    return {
      ...item,
      category: "Declaracao",
      dateLabel: formatShortDate(dueDate),
      dateTone: getDateTone(item.done, dueDate),
      description: `Declaracao anual do MEI - referente a ${monthInfo.declarationYear}`,
      priorityLabel: "Importante",
      title: `DASN-SIMEI ${monthInfo.declarationYear}`,
    };
  }

  if (item.key === "guardar-comprovantes") {
    return {
      ...item,
      ...base,
      category: "Organizacao",
      description: "Organize notas, recibos e comprovantes do periodo",
      title: "Separar comprovantes",
    };
  }

  if (item.key === "revisar-fechamento") {
    return {
      ...item,
      category: "Rotina",
      dateLabel: formatShortDate(monthInfo.nextReviewDate),
      dateTone: getDateTone(item.done, monthInfo.nextReviewDate),
      description: "Valide o resultado consolidado antes da virada do mes",
      title: "Conferir fechamento do mes",
    };
  }

  if (item.key === "conferir-entradas") {
    return {
      ...item,
      ...base,
      category: "Financeiro",
      description: "Confirme entradas e recebimentos registrados",
      title: "Revisar entradas do mes",
    };
  }

  if (item.key === "conferir-despesas") {
    return {
      ...item,
      ...base,
      category: "Financeiro",
      description: "Confirme despesas e saidas registradas",
      title: "Revisar despesas do mes",
    };
  }

  return {
    ...item,
    ...base,
  };
}

function getDateTone(done: boolean, dueDate: Date): EnrichedChecklistItem["dateTone"] {
  if (done) {
    return "success";
  }

  const daysUntil = Math.round(
    (startOfDay(dueDate).getTime() - startOfDay(new Date()).getTime()) / (1000 * 60 * 60 * 24),
  );

  if (daysUntil < 0) {
    return "danger";
  }

  if (daysUntil <= 5) {
    return "warning";
  }

  return "neutral";
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(date).replace(".", "");
}

function capitalizeMonthLabel(value: string) {
  return value
    .split(" ")
    .map((part, index) => (index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function updateItemState(items: ChecklistItem[], key: string, done: boolean) {
  return items.map((item) => (item.key === key ? { ...item, done } : item));
}
