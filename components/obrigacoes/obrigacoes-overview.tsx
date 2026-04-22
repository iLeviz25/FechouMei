import type { ReactNode } from "react";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Receipt,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ObrigacoesChecklist } from "@/components/obrigacoes/obrigacoes-checklist";
import { ObrigacoesReminders } from "@/components/obrigacoes/obrigacoes-reminders";
import { cn } from "@/lib/utils";
import type { ReminderPreferences } from "@/types/database";

type ChecklistItem = {
  key: string;
  label: string;
  done: boolean;
};

type ObrigacoesOverviewProps = {
  checklist: ChecklistItem[];
  monthKey: string;
  monthLabel: string;
  reminderPreferences: ReminderPreferences;
};

const DAS_DUE_DAY = 20;
const DASN_DUE_MONTH = 4;
const DASN_DUE_DAY = 31;
const DAY_IN_MS = 1000 * 60 * 60 * 24;

type DueStatus = "Concluido" | "Em dia" | "Em breve" | "Hoje" | "Atrasado";
type StatusTone = "success" | "warning" | "danger" | "neutral";

type AttentionItem = {
  detail: string;
  title: string;
  tone: StatusTone;
};

function getChecklistItem(checklist: ChecklistItem[], key: string) {
  return checklist.find((item) => item.key === key);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getDaysUntil(dueDate: Date, today: Date) {
  return Math.round((startOfDay(dueDate).getTime() - startOfDay(today).getTime()) / DAY_IN_MS);
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date);
}

function getDueHelper(status: DueStatus, dueDate: Date, daysUntil: number) {
  if (status === "Concluido") {
    return "Marcado como concluido no checklist.";
  }

  if (status === "Atrasado") {
    return `Venceu em ${formatShortDate(dueDate)}.`;
  }

  if (status === "Hoje") {
    return "Vence hoje.";
  }

  if (status === "Em breve") {
    return daysUntil === 1 ? "Vence amanha." : `Vence em ${daysUntil} dias.`;
  }

  return `Vence em ${formatShortDate(dueDate)}.`;
}

function getDueInfo({
  done,
  dueDate,
  soonWindowDays,
  today,
}: {
  done: boolean;
  dueDate: Date;
  soonWindowDays: number;
  today: Date;
}) {
  const daysUntil = getDaysUntil(dueDate, today);
  const status: DueStatus = done
    ? "Concluido"
    : daysUntil < 0
      ? "Atrasado"
      : daysUntil === 0
        ? "Hoje"
        : daysUntil <= soonWindowDays
          ? "Em breve"
          : "Em dia";

  const tone: StatusTone =
    status === "Concluido" || status === "Em dia"
      ? "success"
      : status === "Atrasado"
        ? "danger"
        : "warning";

  return {
    helper: getDueHelper(status, dueDate, daysUntil),
    status,
    tone,
  };
}

export function ObrigacoesOverview({ checklist, monthKey, monthLabel, reminderPreferences }: ObrigacoesOverviewProps) {
  const total = checklist.length;
  const doneCount = checklist.filter((item) => item.done).length;
  const pendingCount = total - doneCount;
  const progressPercent = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const today = new Date();
  const currentYear = today.getFullYear();

  const dasDone = getChecklistItem(checklist, "pagar-das")?.done ?? false;
  const dasInfo = getDueInfo({
    done: dasDone,
    dueDate: new Date(currentYear, today.getMonth(), DAS_DUE_DAY),
    soonWindowDays: 5,
    today,
  });
  const dasnDone = getChecklistItem(checklist, "entregar-dasn")?.done ?? false;
  const dasnInfo = getDueInfo({
    done: dasnDone,
    dueDate: new Date(currentYear, DASN_DUE_MONTH, DASN_DUE_DAY),
    soonWindowDays: 30,
    today,
  });

  const attentionItems: AttentionItem[] = [];

  if (dasInfo.status === "Atrasado" || dasInfo.status === "Hoje" || dasInfo.status === "Em breve") {
    attentionItems.push({
      detail: dasInfo.helper,
      title: "DAS mensal",
      tone: dasInfo.tone,
    });
  }

  if (dasnInfo.status === "Atrasado" || dasnInfo.status === "Hoje" || dasnInfo.status === "Em breve") {
    attentionItems.push({
      detail: dasnInfo.helper,
      title: "DASN-SIMEI",
      tone: dasnInfo.tone,
    });
  }

  if (pendingCount > 0 && today.getDate() >= 25) {
    attentionItems.push({
      detail: "Revise o fechamento e guarde os comprovantes antes da virada do mes.",
      title: "Fechamento do mes",
      tone: "warning",
    });
  }

  const summaryTone: StatusTone =
    pendingCount === 0
      ? "success"
      : attentionItems.some((item) => item.tone === "danger")
        ? "danger"
        : attentionItems.length > 0
          ? "warning"
          : "neutral";

  const obligations = [
    {
      description: "Imposto mensal do MEI. Marque no checklist quando pagar.",
      helper: dasInfo.helper,
      icon: Receipt,
      status: dasInfo.status,
      title: "DAS mensal",
    },
    {
      description: "Declaracao anual do MEI. Use o checklist para nao perder o prazo.",
      helper: dasnInfo.helper,
      icon: FileText,
      status: dasnInfo.status,
      title: "DASN-SIMEI",
    },
  ];

  return (
    <div className="mobile-section-gap">
      <section className="summary-shell relative overflow-hidden rounded-[32px] p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-10 top-0 h-36 w-36 rounded-full bg-secondary/12 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 left-0 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <Badge className="hero-pill w-fit" variant="secondary">
                <Sparkles className="mr-1 h-3 w-3" />
                Checklist MEI
              </Badge>
              <div className="space-y-1">
                <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Obrigacoes do mes</h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  Veja o que ja foi feito, o que falta marcar e o que merece sua atencao agora.
                </p>
              </div>
            </div>
            <div className="hero-panel rounded-[24px] px-4 py-3 sm:px-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-primary/70">
                Mes acompanhado
              </p>
              <p className="mt-1 text-base font-extrabold text-foreground">{monthLabel}</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="hero-panel rounded-[24px] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-primary/70">
                    Progresso do mes
                  </p>
                  <p className="mt-1 text-3xl font-extrabold text-foreground">{progressPercent}%</p>
                </div>
                <Badge
                  className={cn(
                    "w-fit",
                    summaryTone === "success" && "border-success/15 bg-success/10 text-success",
                    summaryTone === "warning" && "border-secondary/15 bg-secondary-soft text-secondary-foreground",
                    summaryTone === "danger" && "border-destructive/15 bg-destructive/10 text-destructive",
                    summaryTone === "neutral" && "border-border/70 bg-muted/70 text-foreground",
                  )}
                  variant="secondary"
                >
                  {pendingCount === 0 ? "Em dia" : attentionItems.length > 0 ? "No radar" : "Pendencias"}
                </Badge>
              </div>

              <div className="mt-4 h-3 overflow-hidden rounded-full bg-muted/80">
                <div className="h-full rounded-full bg-gradient-glow" style={{ width: `${progressPercent}%` }} />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <StatusStat
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  label="Concluidas"
                  tone="success"
                  value={`${doneCount}/${total}`}
                />
                <StatusStat
                  icon={<ClipboardCheck className="h-4 w-4" />}
                  label="Pendentes"
                  tone={pendingCount === 0 ? "success" : "neutral"}
                  value={String(pendingCount)}
                />
                <StatusStat
                  icon={<BellRing className="h-4 w-4" />}
                  label="Alertas"
                  tone={attentionItems.length === 0 ? "success" : summaryTone}
                  value={String(attentionItems.length)}
                />
              </div>
            </div>

            <div className="space-y-3">
              <p className="hero-kicker text-[11px] font-bold uppercase tracking-[0.1em]">
                Atencao do mes
              </p>
              {attentionItems.length > 0 ? (
                attentionItems.map((item) => (
                  <AttentionRow detail={item.detail} key={`${item.title}-${item.detail}`} title={item.title} tone={item.tone} />
                ))
              ) : (
                <div className="hero-panel-soft rounded-[24px] p-4 text-sm leading-6 text-muted-foreground">
                  Nada critico no momento. Continue marcando o checklist conforme concluir.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <Card>
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Checklist</p>
            <h2 className="mt-1 text-lg font-extrabold tracking-tight text-foreground">O que fazer neste mes</h2>
          </div>
          <ObrigacoesChecklist items={checklist} monthKey={monthKey} />
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardContent className="space-y-3 p-5 sm:p-6">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                Obrigacoes principais
              </p>
              <h2 className="mt-1 text-lg font-extrabold tracking-tight text-foreground">O que fica no radar</h2>
            </div>

            {obligations.map((item) => {
              const Icon = item.icon;

              return (
                <div className="surface-panel-muted rounded-[24px] p-4" key={item.title}>
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
                        item.status === "Concluido" && "bg-success/10 text-success",
                        item.status === "Em dia" && "bg-primary-soft text-primary",
                        (item.status === "Em breve" || item.status === "Hoje") &&
                          "bg-secondary-soft text-secondary-foreground",
                        item.status === "Atrasado" && "bg-destructive/10 text-destructive",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-foreground">{item.title}</p>
                        <Badge variant={item.status === "Atrasado" ? "danger" : item.status === "Concluido" ? "success" : "warning"}>
                          {item.status}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.description}</p>
                      <p className="mt-2 text-xs font-semibold text-muted-foreground">{item.helper}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <ObrigacoesReminders preferences={reminderPreferences} />
      </section>
    </div>
  );
}

function StatusStat({
  icon,
  label,
  tone,
  value,
}: {
  icon: ReactNode;
  label: string;
  tone: StatusTone;
  value: string;
}) {
  return (
    <div className="surface-panel-muted rounded-[22px] p-3">
      <div className={cn("flex h-8 w-8 items-center justify-center rounded-2xl", getSummaryToneClass(tone))}>{icon}</div>
      <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-extrabold text-foreground">{value}</p>
    </div>
  );
}

function AttentionRow({ detail, title, tone }: AttentionItem) {
  return (
    <div className="hero-panel-soft flex gap-3 rounded-[24px] p-4">
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl", getSummaryToneClass(tone))}>
        <AlertTriangle className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold text-foreground">{title}</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function getSummaryToneClass(tone: StatusTone) {
  if (tone === "success") {
    return "bg-success/12 text-success";
  }

  if (tone === "warning") {
    return "bg-secondary-soft text-secondary-foreground";
  }

  if (tone === "danger") {
    return "bg-destructive/12 text-destructive";
  }

  return "bg-primary-soft text-primary";
}
