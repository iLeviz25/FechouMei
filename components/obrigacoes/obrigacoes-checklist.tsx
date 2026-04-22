"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toggleChecklistItem } from "@/app/app/obrigacoes/actions";
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

type ObrigacoesChecklistProps = {
  items: ChecklistItem[];
  monthKey: string;
};

export function ObrigacoesChecklist({ items, monthKey }: ObrigacoesChecklistProps) {
  const router = useRouter();
  const [localItems, setLocalItems] = useState(items);
  const [pendingKeys, setPendingKeys] = useState<string[]>([]);
  const [status, setStatus] = useState<ChecklistStatus | null>(null);
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
    <div className="space-y-3">
      {localItems.map((item) => {
        const disabled = pendingKeys.includes(item.key);

        return (
          <button
            className={cn(
              "flex w-full items-start gap-3 rounded-[24px] border px-4 py-4 text-left transition-all",
              item.done
                ? "border-success/20 bg-success/10 text-muted-foreground"
                : "border-border/70 bg-muted/30 text-foreground hover:-translate-y-0.5 hover:border-primary/20 hover:bg-primary-soft/30",
              disabled && "opacity-80",
            )}
            key={item.key}
            onClick={() => handleToggle(item)}
            type="button"
          >
            <span
              className={cn(
                "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border-2 transition-colors",
                item.done ? "border-success bg-success text-success-foreground" : "border-border bg-card",
              )}
            >
              {item.done ? <CheckCircle2 className="h-4 w-4" /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn("block text-sm font-bold leading-6", item.done && "line-through")}>
                {item.label}
              </span>
              <span className={cn("mt-1 block text-xs font-semibold", item.done ? "text-success" : "text-muted-foreground")}>
                {item.done ? "Concluido" : "Ainda falta"}
              </span>
            </span>
            {disabled ? <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin text-muted-foreground" /> : null}
          </button>
        );
      })}
      {status ? (
        <p className={cn("text-xs font-semibold", status.kind === "error" ? "text-destructive" : "text-muted-foreground")} role="status">
          {status.message}
        </p>
      ) : null}
    </div>
  );
}

function updateItemState(items: ChecklistItem[], key: string, done: boolean) {
  return items.map((item) => (item.key === key ? { ...item, done } : item));
}
