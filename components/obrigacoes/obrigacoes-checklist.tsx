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
    <div className="space-y-3">
      {localItems.map((item) => {
        const disabled = isPending && pendingKey === item.key;
        return (
          <label
            className="flex items-start gap-3 rounded-md border p-3 text-sm text-neutral-700"
            key={item.key}
          >
            <input
              checked={item.done}
              className="mt-1 h-4 w-4 accent-emerald-600"
              disabled={disabled}
              onChange={() => handleToggle(item)}
              type="checkbox"
            />
            <span className={item.done ? "text-neutral-500 line-through" : undefined}>{item.label}</span>
          </label>
        );
      })}
      {isPending && pendingKey ? (
        <p className="text-xs text-neutral-500">Salvando atualização...</p>
      ) : null}
    </div>
  );
}
