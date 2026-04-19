"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
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
    setStatus({ kind: "saving", message: "Salvando atualização..." });

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
    <div className="space-y-2">
      {localItems.map((item) => {
        const disabled = pendingKeys.includes(item.key);

        return (
          <label
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-md border border-neutral-200 bg-white p-2.5 text-sm text-neutral-800 shadow-[0_4px_14px_rgba(15,23,42,0.035)] transition-colors",
              item.done && "border-emerald-100 bg-emerald-50/50 text-neutral-500",
              disabled && "opacity-80",
            )}
            key={item.key}
          >
            <span
              className={cn(
                "relative mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border bg-white",
                item.done ? "border-emerald-500 bg-emerald-600" : "border-neutral-300",
              )}
            >
              <input
                checked={item.done}
                className="absolute inset-0 cursor-pointer opacity-0"
                disabled={disabled}
                onChange={() => handleToggle(item)}
                type="checkbox"
              />
              {item.done ? <Check className="h-3 w-3 text-white" /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block font-medium leading-5",
                  item.done ? "text-neutral-500 line-through" : "text-neutral-800",
                )}
              >
                {item.label}
              </span>
              <span
                className={cn(
                  "mt-0.5 block text-xs font-medium",
                  item.done ? "text-emerald-700" : "text-neutral-600",
                )}
              >
                {item.done ? "Concluído" : "Ainda falta"}
              </span>
            </span>
            {disabled ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-neutral-400" /> : null}
          </label>
        );
      })}
      {status ? (
        <p
          className={cn(
            "text-xs font-medium",
            status.kind === "error" ? "text-rose-600" : "text-neutral-500",
          )}
          role="status"
        >
          {status.message}
        </p>
      ) : null}
    </div>
  );
}

function updateItemState(items: ChecklistItem[], key: string, done: boolean) {
  return items.map((item) => (item.key === key ? { ...item, done } : item));
}
