import type { ReactNode } from "react";
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  FileText,
  ListChecks,
  ReceiptText,
} from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

type DueStatus = "Concluído" | "Em dia" | "Em breve" | "Hoje" | "Atrasado";
type StatusTone = "success" | "warning" | "danger" | "neutral";

type AttentionItem = {
  detail: string;
  title: string;
  tone: StatusTone;
};

function getToneVariant(tone: StatusTone): BadgeProps["variant"] {
  if (tone === "success") {
    return "success";
  }

  if (tone === "warning") {
    return "warning";
  }

  if (tone === "danger") {
    return "danger";
  }

  return "secondary";
}

function getStatusTone(status: DueStatus) {
  if (status === "Concluído" || status === "Em dia") {
    return "border-emerald-100 bg-emerald-50 text-emerald-700";
  }

  if (status === "Atrasado") {
    return "border-red-100 bg-red-50 text-red-700";
  }

  if (status === "Hoje" || status === "Em breve") {
    return "border-amber-100 bg-amber-50 text-amber-700";
  }

  return "border-neutral-200 bg-neutral-50 text-neutral-700";
}

function getStatusVariant(status: DueStatus): BadgeProps["variant"] {
  if (status === "Concluído" || status === "Em dia") {
    return "success";
  }

  if (status === "Atrasado") {
    return "danger";
  }

  return "warning";
}

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
  if (status === "Concluído") {
    return "Marcado como concluído.";
  }

  if (status === "Atrasado") {
    return `Venceu em ${formatShortDate(dueDate)}.`;
  }

  if (status === "Hoje") {
    return "Vence hoje.";
  }

  if (status === "Em breve") {
    return daysUntil === 1 ? "Vence amanhã." : `Vence em ${daysUntil} dias.`;
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
    ? "Concluído"
    : daysUntil < 0
      ? "Atrasado"
      : daysUntil === 0
        ? "Hoje"
        : daysUntil <= soonWindowDays
          ? "Em breve"
          : "Em dia";

  const tone: StatusTone =
    status === "Concluído" || status === "Em dia"
      ? "success"
      : status === "Atrasado"
        ? "danger"
        : "warning";

  return {
    daysUntil,
    dueDate,
    helper: getDueHelper(status, dueDate, daysUntil),
    status,
    tone,
  };
}

export function ObrigacoesOverview({ checklist, monthKey, monthLabel, reminderPreferences }: ObrigacoesOverviewProps) {
  const total = checklist.length;
  const doneCount = checklist.filter((item) => item.done).length;
  const pendingItems = checklist.filter((item) => !item.done);
  const pendingCount = pendingItems.length;
  const progressPercent = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const today = new Date();
  const currentYear = today.getFullYear();
  const dasDone = getChecklistItem(checklist, "pagar-das")?.done ?? false;
  const dasDueDate = new Date(currentYear, today.getMonth(), DAS_DUE_DAY);
  const dasInfo = getDueInfo({ done: dasDone, dueDate: dasDueDate, soonWindowDays: 5, today });
  const dasnDone = getChecklistItem(checklist, "entregar-dasn")?.done ?? false;
  const dasnDueDate = new Date(currentYear, DASN_DUE_MONTH, DASN_DUE_DAY);
  const dasnInfo = getDueInfo({ done: dasnDone, dueDate: dasnDueDate, soonWindowDays: 30, today });
  const fechamentoDone = getChecklistItem(checklist, "revisar-fechamento")?.done ?? false;
  const comprovantesDone = getChecklistItem(checklist, "guardar-comprovantes")?.done ?? false;
  const nearMonthEnd = today.getDate() >= 25;

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

  if (!fechamentoDone && nearMonthEnd) {
    attentionItems.push({
      detail: "Revise o fechamento antes de virar o mês.",
      title: "Fechamento mensal",
      tone: "warning",
    });
  }

  if (!comprovantesDone && nearMonthEnd) {
    attentionItems.push({
      detail: "Guarde os comprovantes do mês enquanto está tudo fácil de achar.",
      title: "Comprovantes",
      tone: "warning",
    });
  }

  const hasOverdue = attentionItems.some((item) => item.tone === "danger");
  const summaryTone: StatusTone =
    pendingCount === 0 ? "success" : hasOverdue ? "danger" : attentionItems.length > 0 ? "warning" : "neutral";
  const summaryLabel =
    pendingCount === 0
      ? "Mês em dia"
      : hasOverdue
        ? "Atenção agora"
        : attentionItems.length > 0
          ? "Prazos no radar"
          : "Mês com pendências";
  const summaryText =
    pendingCount === 0
      ? "Tudo marcado para este mês. Mantenha os comprovantes guardados."
      : hasOverdue
        ? "Há obrigação vencida ou item importante para resolver agora."
        : attentionItems.length > 0
          ? "Alguns itens têm prazo próximo ou merecem conferência nesta parte do mês."
          : "Ainda há itens pendentes, mas nenhum alerta forte de prazo agora.";

  const obligations = [
    {
      title: "DAS mensal",
      description: "Imposto mensal do MEI. Marque no checklist quando pagar.",
      frequency: "Mensal",
      helper: dasInfo.helper,
      icon: ReceiptText,
      status: dasInfo.status,
    },
    {
      title: "DASN-SIMEI",
      description: "Declaração anual do MEI. Use o checklist para lembrar da entrega.",
      frequency: "Anual",
      helper: dasnInfo.helper,
      icon: FileText,
      status: dasnInfo.status,
    },
  ];

  return (
    <div className="space-y-3.5 pb-6 sm:space-y-4">
      <header className="rounded-lg border border-neutral-200 bg-[linear-gradient(180deg,#ffffff_0%,#fafafa_100%)] p-4 shadow-[0_10px_30px_rgba(15,23,42,0.055)] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2.5">
            <Badge variant="success" className="w-fit px-3 py-1">
              Checklist MEI
            </Badge>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-neutral-950 sm:text-3xl">
                Obrigações do mês
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
                Marque o que já foi feito e veja o que está pendente, em prazo ou pedindo atenção.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-neutral-200 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.045)] lg:min-w-72">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Mês acompanhado</p>
                <p className="mt-1 text-sm font-semibold text-neutral-950">{monthLabel}</p>
              </div>
              <Badge variant={getToneVariant(summaryTone)} className="shrink-0">
                {summaryLabel}
              </Badge>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progressPercent}%` }} />
            </div>
            <p className="mt-2 text-xs font-medium text-neutral-500">
              {doneCount} de {total} itens marcados como feitos
            </p>
          </div>
        </div>
      </header>

      <Card className="border-neutral-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.055)]">
        <CardHeader className="p-4 pb-2.5 sm:p-5 sm:pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-neutral-950">Central de pendências</CardTitle>
              <CardDescription className="mt-1">{summaryText}</CardDescription>
            </div>
            <Badge variant={getToneVariant(summaryTone)} className="w-fit shrink-0">
              {summaryLabel}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0 sm:p-5 sm:pt-0">
          <div className="grid gap-2.5 sm:grid-cols-3">
            <SummaryPill
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="Concluídas"
              tone="success"
              value={`${doneCount} de ${total}`}
            />
            <SummaryPill
              icon={<CalendarCheck className="h-4 w-4" />}
              label="Pendentes"
              tone={pendingCount === 0 ? "success" : "neutral"}
              value={String(pendingCount)}
            />
            <SummaryPill
              icon={<Clock3 className="h-4 w-4" />}
              label="Atenção agora"
              tone={attentionItems.length === 0 ? "success" : summaryTone}
              value={String(attentionItems.length)}
            />
          </div>

          {attentionItems.length > 0 ? (
            <div className="space-y-2 border-t border-neutral-100 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">O que olhar agora</p>
              {attentionItems.slice(0, 4).map((item) => (
                <AttentionRow detail={item.detail} key={`${item.title}-${item.detail}`} title={item.title} tone={item.tone} />
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-sm font-medium leading-6 text-emerald-800">
              Nenhum prazo crítico agora. Continue marcando o checklist conforme concluir.
            </p>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-2.5 sm:grid-cols-2">
        {obligations.map((item) => {
          const Icon = item.icon;

          return (
            <Card
              className="overflow-hidden border-neutral-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]"
              key={item.title}
            >
              <CardContent className="p-3.5 sm:p-4">
                <div className="flex items-start gap-3">
                  <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md border", getStatusTone(item.status))}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-base font-semibold leading-tight text-neutral-950">{item.title}</p>
                        <p className="mt-1 text-sm leading-5 text-neutral-600">{item.description}</p>
                      </div>
                      <Badge variant={getStatusVariant(item.status)} className="shrink-0">
                        {item.status}
                      </Badge>
                    </div>

                    <div className="mt-2.5 flex flex-wrap gap-2 text-xs font-medium text-neutral-600">
                      <span className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1">
                        {item.frequency}
                      </span>
                      <span className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1">
                        {item.helper}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <ObrigacoesReminders preferences={reminderPreferences} />

      <Card className="border-neutral-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
        <CardHeader className="p-4 pb-2.5 sm:p-5 sm:pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-neutral-950">O que fazer neste mês</CardTitle>
              <CardDescription className="mt-1">
                Marque conforme concluir. A visão geral usa isso para orientar os alertas.
              </CardDescription>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-emerald-100 bg-emerald-50 text-emerald-700">
              <ListChecks className="h-4 w-4" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
          <ObrigacoesChecklist items={checklist} monthKey={monthKey} />
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryPill({
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
    <div className="flex items-center gap-3 rounded-md border border-neutral-200 bg-neutral-50/70 p-2.5">
      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md border", getSummaryToneClass(tone))}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
        <p className="mt-0.5 text-base font-bold text-neutral-950">{value}</p>
      </div>
    </div>
  );
}

function AttentionRow({ detail, title, tone }: AttentionItem) {
  return (
    <div className="flex gap-2.5 rounded-md border border-neutral-200 bg-neutral-50/70 p-2.5">
      <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border", getSummaryToneClass(tone))}>
        <AlertTriangle className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-neutral-950">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-neutral-600 sm:text-sm">{detail}</p>
      </div>
    </div>
  );
}

function getSummaryToneClass(tone: StatusTone) {
  if (tone === "success") {
    return "border-emerald-100 bg-emerald-50 text-emerald-700";
  }

  if (tone === "warning") {
    return "border-amber-100 bg-amber-50 text-amber-700";
  }

  if (tone === "danger") {
    return "border-red-100 bg-red-50 text-red-700";
  }

  return "border-neutral-200 bg-white text-neutral-700";
}
