"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { createMovimentacao, type MovementActionResult } from "@/app/app/movimentacoes/actions";
import { Button } from "@/components/ui/button";
import {
  createEmptyMovementForm,
  MovementFields,
  validateMovementForm,
  type MovementFormState,
} from "@/components/movimentacoes/movement-form-fields";
import { cn } from "@/lib/utils";

type MovementCreateSheetProps = {
  onCreated?: (result: MovementActionResult) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  viewportClassName?: string;
};

export function MovementCreateSheet({
  onCreated,
  onOpenChange,
  open,
  viewportClassName = "lg:hidden",
}: MovementCreateSheetProps) {
  const router = useRouter();
  const [form, setForm] = useState<MovementFormState>(() => createEmptyMovementForm());
  const [feedback, setFeedback] = useState<MovementActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return null;
  }

  function updateField(field: keyof MovementFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function closeSheet() {
    if (isPending) {
      return;
    }

    setForm(createEmptyMovementForm());
    setFeedback(null);
    onOpenChange(false);
  }

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationMessage = validateMovementForm(form);

    if (validationMessage) {
      setFeedback({ ok: false, message: validationMessage });
      return;
    }

    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await createMovimentacao(formData);
      setFeedback(result.ok ? null : result);

      if (result.ok) {
        setForm(createEmptyMovementForm());
        onOpenChange(false);
        onCreated?.(result);
        router.refresh();
      }
    });
  }

  return (
    <div
      aria-labelledby="global-create-movement-title"
      aria-modal="true"
      className={cn(
        "fixed inset-0 z-50 flex items-end bg-neutral-950/45 px-3 pb-[calc(6.25rem+env(safe-area-inset-bottom))] pt-8 sm:items-center sm:justify-center sm:p-4",
        viewportClassName,
      )}
      onClick={closeSheet}
      role="dialog"
    >
      <div
        className="w-full overflow-hidden rounded-[30px] border border-border/70 bg-card shadow-elevated sm:max-w-md"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-border/80 sm:hidden" />

        <div className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-4 sm:px-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
              Nova movimentacao
            </p>
            <h2 className="mt-1 text-lg font-extrabold tracking-tight text-foreground" id="global-create-movement-title">
              Lancar entrada ou despesa
            </h2>
          </div>
          <Button disabled={isPending} onClick={closeSheet} size="icon" type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form
          className="max-h-[min(72dvh,36rem)] space-y-5 overflow-y-auto px-4 pb-4 pt-4 sm:px-5 sm:pb-5"
          noValidate
          onSubmit={handleCreate}
        >
          <MovementFields form={form} idPrefix="global-create" onChange={updateField} />

          {feedback ? (
            <p
              className={cn(
                "rounded-[20px] border px-4 py-3 text-sm leading-6",
                feedback.ok
                  ? "border-success/20 bg-success/10 text-success"
                  : "border-destructive/20 bg-destructive/10 text-destructive",
              )}
              role="status"
            >
              {feedback.message}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <Button disabled={isPending} onClick={closeSheet} type="button" variant="outline">
              Cancelar
            </Button>
            <Button disabled={isPending} type="submit">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
