"use client";

import { useState, useTransition } from "react";
import { toggleChecklistItem } from "@/app/app/obrigacoes/actions";

type ChecklistItem = {
  key: string;
  label: string;
  done: boolean;
};

type ObrigacoesChecklistProps = {
  items: ChecklistItem[];
  monthKey: string;
};

export function ObrigacoesChecklist({ items, monthKey }: ObrigacoesChecklistProps) {
  const [localItems, setLocalItems] = useState(items);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleToggle(item: ChecklistItem) {
    const nextDone = !item.done;
    setPendingKey(item.key);

    startTransition(async () => {
      const result = await toggleChecklistItem({
        itemKey: item.key,
        done: nextDone,
        monthKey,
      });

      if (result.ok) {
        setLocalItems((current) =>
          current.map((entry) => (entry.key === item.key ? { ...entry, done: nextDone } : entry)),
        );
      }

      setPendingKey(null);
    });
  }

  return (
    <div className="space-y-2.5">
      {localItems.map((item) => {
        const disabled = isPending && pendingKey === item.key;
        return (
          <label
            className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 text-sm transition-all duration-200 ${
              item.done
                ? "border-primary/20 bg-accent/50"
                : "border-border/60 bg-card hover:border-border hover:bg-muted/30"
            }`}
            key={item.key}
          >
            <div className="relative flex h-5 w-5 shrink-0 items-center justify-center">
              <input
                checked={item.done}
                className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border-2 border-border bg-card transition-colors checked:border-primary checked:bg-primary"
                disabled={disabled}
                onChange={() => handleToggle(item)}
                type="checkbox"
              />
              {item.done && (
                <svg
                  className="pointer-events-none absolute h-3 w-3 text-primary-foreground"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  viewBox="0 0 24 24"
                >
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <span className={item.done ? "text-muted-foreground line-through" : "text-foreground"}>
              {item.label}
            </span>
          </label>
        );
      })}
      {isPending && pendingKey ? (
        <p className="text-xs text-muted-foreground">Salvando atualizacao...</p>
      ) : null}
    </div>
  );
}
