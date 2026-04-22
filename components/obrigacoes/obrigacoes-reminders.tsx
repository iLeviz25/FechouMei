"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BellRing, Check } from "lucide-react";
import { updateReminderPreferences } from "@/app/app/obrigacoes/actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
    description: "Entrega anual da declaracao do MEI.",
    key: "dasn_annual_enabled",
    label: "DASN-SIMEI anual",
  },
  {
    description: "Conferir entradas, despesas e fechamento.",
    key: "monthly_review_enabled",
    label: "Revisao do mes",
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
    setStatus({ kind: "saving", message: "Salvando preferencias..." });

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
        message: hasNewerState || queuedState ? "Preferencias salvas no app." : result.message,
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
    <Card>
      <CardContent className="space-y-4 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
              Lembretes no app
            </p>
            <h2 className="mt-1 text-lg font-extrabold tracking-tight text-foreground">Ative o que faz sentido</h2>
          </div>
          <Badge variant={activeCount > 0 ? "success" : "secondary"}>{activeCount} ativos</Badge>
        </div>

        <div className="space-y-3">
          {reminderOptions.map((option) => {
            const active = reminders[option.key];

            return (
              <button
                aria-pressed={active}
                className={cn(
                  "flex w-full items-start gap-3 rounded-[24px] border px-4 py-4 text-left transition-all",
                  active
                    ? "surface-panel border-primary/20 bg-primary-soft/25"
                    : "surface-panel-muted hover:border-primary/20 hover:bg-primary-soft/20",
                )}
                key={option.key}
                onClick={() => toggleReminder(option.key)}
                type="button"
              >
                <span
                  className={cn(
                    "icon-tile mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
                    active ? "bg-primary text-primary-foreground" : "bg-white text-muted-foreground",
                  )}
                >
                  {active ? <Check className="h-4 w-4" /> : <BellRing className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-foreground">{option.label}</span>
                  <span className="mt-1 block text-sm leading-6 text-muted-foreground">{option.description}</span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em]",
                    active ? "bg-primary text-primary-foreground" : "bg-white text-muted-foreground",
                  )}
                >
                  {active ? "Ligado" : "Desligado"}
                </span>
              </button>
            );
          })}
        </div>

        <p className="text-xs font-semibold leading-6 text-muted-foreground">
          Base preparada para lembretes futuros. Nenhum envio externo acontece nesta etapa.
        </p>

        {status ? (
          <p
            className={cn("text-xs font-semibold", status.kind === "error" ? "text-destructive" : "text-muted-foreground")}
            role="status"
          >
            {status.message}
          </p>
        ) : null}
        {isSaving ? <span className="sr-only">Salvando preferencias.</span> : null}
      </CardContent>
    </Card>
  );
}

function areReminderStatesEqual(a: ReminderState, b: ReminderState) {
  return reminderKeys.every((key) => a[key] === b[key]);
}
