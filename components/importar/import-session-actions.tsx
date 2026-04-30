"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { cancelImportSessionAction, confirmImportSessionAction, type ImportSessionFormState } from "@/app/app/importar/sessao/[id]/actions";

const initialState: ImportSessionFormState = null;

export function ImportSessionActions({
  disabled,
  importableCount,
  sessionId,
}: {
  disabled?: boolean;
  importableCount: number;
  sessionId: string;
}) {
  const router = useRouter();
  const [confirmState, confirmFormAction, confirmPending] = useActionState(confirmImportSessionAction, initialState);
  const [cancelState, cancelFormAction, cancelPending] = useActionState(cancelImportSessionAction, initialState);
  const state = confirmState ?? cancelState;
  const pending = confirmPending || cancelPending;

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
    }
  }, [router, state]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <form action={confirmFormAction}>
          <input name="sessionId" type="hidden" value={sessionId} />
          <Button disabled={disabled || pending || importableCount === 0} type="submit">
            {confirmPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Importar movimentacoes
          </Button>
        </form>

        <form action={cancelFormAction}>
          <input name="sessionId" type="hidden" value={sessionId} />
          <Button disabled={disabled || pending} type="submit" variant="outline">
            {cancelPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            Cancelar importacao
          </Button>
        </form>
      </div>

      {state ? (
        <p
          className={cn(
            "rounded-[20px] border px-4 py-3 text-sm font-semibold leading-6",
            state.ok ? "border-primary/15 bg-primary-soft/50 text-primary" : "border-destructive/20 bg-destructive/10 text-destructive",
          )}
          role="status"
        >
          {state.message}
          {state.ok && typeof state.skippedDuplicateCount === "number" && state.skippedDuplicateCount > 0
            ? ` ${state.skippedDuplicateCount} duplicada(s) ignorada(s).`
            : ""}
        </p>
      ) : null}
    </div>
  );
}
