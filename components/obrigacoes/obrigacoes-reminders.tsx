"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BellRing, Check } from "lucide-react";
import { updateReminderPreferences } from "@/app/app/obrigacoes/actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ReminderPreferences } from "@/types/database";

type ReminderKey =
  | "das_monthly_enabled"
  | "dasn_annual_enabled"
  | "monthly_review_enabled"
  | "receipts_enabled";

type ReminderState = Record<ReminderKey, boolean>;

type ReminderStatus =
  | { kind: "error"; message: string }
  | { kind: "saving"; message: string }
  | { kind: "success"; message: string };

const reminderOptions: Array<{
  description: string;
  key: ReminderKey;
  label: string;
}> = [
  {
    description: "Pagamento mensal do DAS.",
    key: "das_monthly_enabled",
    label: "DAS mensal",
  },
  {
    description: "Entrega anual da declaração do MEI.",
    key: "dasn_annual_enabled",
    label: "DASN-SIMEI anual",
  },
  {
    description: "Conferir entradas, despesas e fechamento.",
    key: "monthly_review_enabled",
    label: "Revisão do mês",
  },
  {
    description: "Separar recibos, notas e comprovantes.",
    key: "receipts_enabled",
    label: "Guardar comprovantes",
  },
];

const reminderKeys: ReminderKey[] = [
  "das_monthly_enabled",
  "dasn_annual_enabled",
  "monthly_review_enabled",
  "receipts_enabled",
];

function toReminderState(preferences: ReminderPreferences): ReminderState {
  return {
    das_monthly_enabled: preferences.das_monthly_enabled,
    dasn_annual_enabled: preferences.dasn_annual_enabled,
    monthly_review_enabled: preferences.monthly_review_enabled,
    receipts_enabled: preferences.receipts_enabled,
  };
}

export function ObrigacoesReminders({ preferences }: { preferences: ReminderPreferences }) {
  const initialState = toReminderState(preferences);
  const [status, setStatus] = useState<ReminderStatus | null>(null);
  const [reminders, setReminders] = useState<ReminderState>(initialState);
  const [isSaving, setIsSaving] = useState(false);
  const confirmedStateRef = useRef(initialState);
  const latestStateRef = useRef(initialState);
  const queuedStateRef = useRef<ReminderState | null>(null);
  const saveInFlightRef = useRef<ReminderState | null>(null);
  const activeCount = useMemo(() => Object.values(reminders).filter(Boolean).length, [reminders]);

  useEffect(() => {
    const nextState = toReminderState(preferences);

    confirmedStateRef.current = nextState;
    latestStateRef.current = nextState;
    queuedStateRef.current = null;
    saveInFlightRef.current = null;
    setIsSaving(false);
    setStatus(null);
    setReminders(nextState);
  }, [preferences]);

  function toggleReminder(key: ReminderKey) {
    const nextState = {
      ...latestStateRef.current,
      [key]: !latestStateRef.current[key],
    };

    latestStateRef.current = nextState;
    setReminders(nextState);
    setStatus({ kind: "saving", message: "Salvando preferências..." });

    if (saveInFlightRef.current) {
      queuedStateRef.current = nextState;
      return;
    }

    void persistReminderPreferences(nextState);
  }

  async function persistReminderPreferences(stateToSave: ReminderState) {
    saveInFlightRef.current = stateToSave;
    setIsSaving(true);

    const result = await updateReminderPreferences(stateToSave);
    const queuedState = queuedStateRef.current;
    const hasNewerState = !areReminderStatesEqual(latestStateRef.current, stateToSave);

    if (result.ok) {
      confirmedStateRef.current = stateToSave;
      setStatus({
        kind: "success",
        message: hasNewerState || queuedState ? "Preferências salvas no app." : result.message,
      });
    } else {
      if (!hasNewerState && !queuedState) {
        latestStateRef.current = confirmedStateRef.current;
        setReminders(confirmedStateRef.current);
      }

      setStatus({
        kind: "error",
        message: result.message,
      });
    }

    saveInFlightRef.current = null;
    queuedStateRef.current = null;

    if (queuedState && !areReminderStatesEqual(queuedState, confirmedStateRef.current)) {
      void persistReminderPreferences(queuedState);
      return;
    }

    setIsSaving(false);
  }

  return (
    <Card className="border-neutral-200 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.04)]">
      <CardHeader className="p-3.5 pb-2.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-semibold text-neutral-950">Lembretes opcionais</CardTitle>
            <CardDescription className="mt-1 text-xs leading-5">
              Ative só o que vale deixar no radar.
            </CardDescription>
          </div>
          <Badge variant={activeCount > 0 ? "success" : "secondary"} className="shrink-0">
            {activeCount} ativo(s)
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5 p-3.5 pt-0">
        <div className="grid gap-2">
          {reminderOptions.map((option) => {
            const active = reminders[option.key];

            return (
              <button
                aria-pressed={active}
                className={cn(
                  "flex items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors",
                  active
                    ? "border-emerald-200 bg-emerald-50/70"
                    : "border-neutral-200 bg-neutral-50/70 hover:border-neutral-300 hover:bg-white",
                )}
                key={option.key}
                onClick={() => toggleReminder(option.key)}
                type="button"
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
                    active
                      ? "border-emerald-200 bg-white text-emerald-700"
                      : "border-neutral-200 bg-white text-neutral-500",
                  )}
                >
                  {active ? <Check className="h-4 w-4" /> : <BellRing className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-neutral-950">{option.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-neutral-600">{option.description}</span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-md border px-2 py-1 text-[11px] font-semibold",
                    active
                      ? "border-emerald-200 bg-white text-emerald-700"
                      : "border-neutral-200 bg-white text-neutral-500",
                  )}
                >
                  {active ? "Ligado" : "Desligado"}
                </span>
              </button>
            );
          })}
        </div>

        {activeCount === 0 ? (
          <p className="text-xs font-medium leading-5 text-neutral-500">
            Nenhum lembrete ativo por enquanto.
          </p>
        ) : (
          <p className="text-xs font-medium leading-5 text-neutral-500">
            Base preparada para lembretes futuros. Nenhum envio externo acontece nesta etapa.
          </p>
        )}

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
        {isSaving ? <span className="sr-only">Salvando preferências.</span> : null}
      </CardContent>
    </Card>
  );
}

function areReminderStatesEqual(a: ReminderState, b: ReminderState) {
  return reminderKeys.every((key) => a[key] === b[key]);
}
