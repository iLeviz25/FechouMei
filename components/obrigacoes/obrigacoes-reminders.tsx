"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BellRing,
  CalendarCheck2,
  Check,
  ClipboardList,
  FileText,
  ReceiptText,
  type LucideIcon,
} from "lucide-react";
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
  icon: LucideIcon;
  key: ReminderKey;
  label: string;
}> = [
  {
    description: "Preferencia para avisar antes do vencimento mensal do DAS.",
    icon: FileText,
    key: "das_monthly_enabled",
    label: "DAS mensal",
  },
  {
    description: "Preferencia para lembrar da declaracao anual do MEI.",
    icon: BellRing,
    key: "dasn_annual_enabled",
    label: "DASN-SIMEI",
  },
  {
    description: "Preferencia para revisar entradas, despesas e fechamento.",
    icon: ClipboardList,
    key: "monthly_review_enabled",
    label: "Revisao mensal",
  },
  {
    description: "Preferencia para nao esquecer notas, recibos e comprovantes.",
    icon: ReceiptText,
    key: "receipts_enabled",
    label: "Comprovantes",
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
    <Card className="overflow-hidden rounded-[32px]">
      <CardContent className="space-y-4 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-foreground">Lembretes no app</p>
            <h2 className="text-lg font-extrabold tracking-tight text-foreground">Receba avisos antes das obrigacoes</h2>
          </div>
          <Badge variant={activeCount > 0 ? "success" : "secondary"}>{activeCount} ativos</Badge>
        </div>

        <div className="space-y-3">
          {reminderOptions.map((option) => {
            const Icon = option.icon;
            const active = reminders[option.key];

            return (
              <button
                aria-pressed={active}
                className={cn(
                  "flex w-full items-center gap-3 rounded-[24px] border px-4 py-4 text-left transition-[background-color,border-color,color,box-shadow]",
                  active
                    ? "border-primary/18 bg-[linear-gradient(180deg,hsl(152_56%_96%),hsl(152_30%_93%))]"
                    : "surface-panel-muted hover:border-primary/20 hover:bg-primary-soft/20",
                )}
                key={option.key}
                onClick={() => toggleReminder(option.key)}
                type="button"
              >
                <span
                  className={cn(
                    "icon-tile flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                    active ? "bg-primary text-primary-foreground" : "bg-white text-muted-foreground",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-base font-extrabold tracking-tight text-foreground">{option.label}</span>
                  <span className="mt-1 block text-sm leading-6 text-muted-foreground">{option.description}</span>
                </span>

                <span
                  aria-hidden="true"
                  className={cn(
                    "relative flex h-8 w-14 shrink-0 items-center rounded-full p-1 transition-colors",
                    active ? "bg-primary" : "bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full bg-white text-primary shadow-card transition-transform",
                      active ? "translate-x-6" : "translate-x-0 text-muted-foreground",
                    )}
                  >
                    {active ? <Check className="h-3.5 w-3.5" /> : <CalendarCheck2 className="h-3.5 w-3.5" />}
                  </span>
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
