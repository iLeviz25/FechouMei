"use client";
import {
  BellRing,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Receipt,
  ShieldCheck,
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
type AlertIcon = typeof Receipt | typeof ClipboardCheck | typeof FileText;

type AlertItem = {
  dateLabel: string;
  detail: string;
  eyebrow: string;
  icon: AlertIcon;
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

function formatNumericDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date);
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" })
    .format(date)
    .replace(".", "");
}

function formatHeroMonth(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })
    .format(new Date(year, month - 1, 1))
    .replace(" de ", " - ")
    .toUpperCase();
}

function getDueHelper(status: DueStatus, dueDate: Date, daysUntil: number) {
  if (status === "Concluido") {
    return "Marcado como concluido no checklist.";
  }

  if (status === "Atrasado") {
    return `Venceu em ${formatNumericDate(dueDate)}.`;
  }

  if (status === "Hoje") {
    return "Vence hoje.";
  }

  if (status === "Em breve") {
    return daysUntil === 1 ? "Vence amanha." : `Vence em ${daysUntil} dias.`;
  }

  return `Vence em ${formatNumericDate(dueDate)}.`;
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
    daysUntil,
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
  const [currentYear, currentMonth] = monthKey.split("-").map(Number);
  const monthIndex = currentMonth - 1;
  const monthEndDate = new Date(currentYear, currentMonth, 0);
  const reviewWindowDate = new Date(currentYear, currentMonth, 0);
  const closingReviewDate = new Date(currentYear, currentMonth, 3);
  const currentMonthTitle = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(currentYear, monthIndex, 1));

  const dasDone = getChecklistItem(checklist, "pagar-das")?.done ?? false;
  const dasInfo = getDueInfo({
    done: dasDone,
    dueDate: new Date(currentYear, monthIndex, DAS_DUE_DAY),
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

  const reviewEntriesDone = getChecklistItem(checklist, "conferir-entradas")?.done ?? false;
  const reviewExpensesDone = getChecklistItem(checklist, "conferir-despesas")?.done ?? false;
  const receiptsDone = getChecklistItem(checklist, "guardar-comprovantes")?.done ?? false;
  const closingDone = getChecklistItem(checklist, "revisar-fechamento")?.done ?? false;

  const reviewWindowInfo = getDueInfo({
    done: reviewEntriesDone && reviewExpensesDone,
    dueDate: reviewWindowDate,
    soonWindowDays: 10,
    today,
  });

  const receiptsInfo = getDueInfo({
    done: receiptsDone,
    dueDate: monthEndDate,
    soonWindowDays: 10,
    today,
  });

  const closingInfo = getDueInfo({
    done: closingDone,
    dueDate: closingReviewDate,
    soonWindowDays: 7,
    today,
  });

  const alertItems: AlertItem[] = [];

  if (!dasDone && (dasInfo.status === "Atrasado" || dasInfo.status === "Hoje" || dasInfo.status === "Em breve")) {
    alertItems.push({
      dateLabel: formatShortDate(new Date(currentYear, monthIndex, DAS_DUE_DAY)),
      detail: "Documento de Arrecadacao do Simples Nacional",
      eyebrow: formatDeadlineLabel(dasInfo.status, dasInfo.daysUntil),
      icon: Receipt,
      title: `Pagar DAS - ${capitalizeMonthYear(currentMonthTitle)}`,
      tone: getAlertTone(dasInfo.status, dasInfo.daysUntil),
    });
  }

  if (!reviewEntriesDone || !reviewExpensesDone) {
    alertItems.push({
      dateLabel: formatShortDate(reviewWindowDate),
      detail: "Confira entradas e despesas registradas antes do fechamento.",
      eyebrow: formatDeadlineLabel(reviewWindowInfo.status, reviewWindowInfo.daysUntil),
      icon: ClipboardCheck,
      title: "Revisar movimentacoes do mes",
      tone: getAlertTone(reviewWindowInfo.status, reviewWindowInfo.daysUntil),
    });
  }

  if (!receiptsDone) {
    alertItems.push({
      dateLabel: formatShortDate(monthEndDate),
      detail: "Organize notas, recibos e comprovantes do periodo.",
      eyebrow: formatDeadlineLabel(receiptsInfo.status, receiptsInfo.daysUntil),
      icon: FileText,
      title: "Separar comprovantes",
      tone: getAlertTone(receiptsInfo.status, receiptsInfo.daysUntil),
    });
  }

  if (!closingDone && alertItems.length < 3) {
    alertItems.push({
      dateLabel: formatShortDate(closingReviewDate),
      detail: "Valide o resultado consolidado antes da virada do proximo mes.",
      eyebrow: formatDeadlineLabel(closingInfo.status, closingInfo.daysUntil),
      icon: ClipboardCheck,
      title: "Conferir fechamento do mes",
      tone: getAlertTone(closingInfo.status, closingInfo.daysUntil),
    });
  }

  if (!dasnDone && alertItems.length < 3 && dasnInfo.status !== "Em dia") {
    alertItems.push({
      dateLabel: formatShortDate(new Date(currentYear, DASN_DUE_MONTH, DASN_DUE_DAY)),
      detail: `Declaracao anual do MEI referente a ${currentYear - 1}.`,
      eyebrow: formatDeadlineLabel(dasnInfo.status, dasnInfo.daysUntil),
      icon: FileText,
      title: `DASN-SIMEI ${currentYear - 1}`,
      tone: getAlertTone(dasnInfo.status, dasnInfo.daysUntil),
    });
  }

  const summaryTone: StatusTone =
    pendingCount === 0
      ? "success"
      : alertItems.some((item) => item.tone === "danger")
        ? "danger"
        : alertItems.length > 0
          ? "warning"
          : "neutral";

  const supportCopy =
    pendingCount === 0
      ? "Checklist concluido neste mes. Continue acompanhando para manter o MEI em dia."
      : alertItems.length > 0
        ? `${alertItems[0].title} esta no radar agora. Marcar cada etapa concluida ajuda a evitar multa e correria.`
        : "Mantenha o checklist atualizado para chegar no fechamento com tudo organizado.";

  return (
    <div className="mobile-section-gap">
      <header className="space-y-3">
        <Badge className="w-fit" variant="success">
          <Sparkles className="mr-1 h-3 w-3" />
          Sua rotina MEI
        </Badge>
        <div className="max-w-2xl space-y-1.5">
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">Obrigacoes do mes</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Acompanhe o que precisa ser feito em{" "}
            <span className="font-semibold text-foreground">{monthLabel}</span> e mantenha seu MEI em dia.
          </p>
        </div>
      </header>

      <section className="overflow-hidden rounded-[32px] bg-[linear-gradient(180deg,hsl(155_62%_35%)_0%,hsl(160_70%_28%)_100%)] px-5 py-5 text-white shadow-elevated sm:px-6 sm:py-6">
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <Badge className="border-white/10 bg-white/14 text-white shadow-none" variant="outline">
                {formatHeroMonth(monthKey)}
              </Badge>
              <p className="font-mono text-[clamp(2.6rem,14vw,4rem)] font-extrabold leading-none tracking-tight text-white">
                {progressPercent}%
              </p>
              <p className="text-sm font-semibold text-white/82">
                {doneCount} de {total} concluidas - {pendingCount} pendentes
              </p>
            </div>

            <div className="icon-tile flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] bg-white/14 text-secondary shadow-[0_0_10px_rgba(16,185,129,0.18)]">
              <ClipboardCheck className="h-7 w-7" />
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="h-3 overflow-hidden rounded-full bg-white/12">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,hsl(40_100%_60%)_0%,hsl(36_100%_56%)_100%)]"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-3 text-sm font-semibold text-white/88">
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-secondary" />
                {doneCount} concluidas
              </span>
              <span className="inline-flex items-center gap-2">
                {pendingCount} pendentes
                <BellRing className="h-4 w-4" />
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-[24px] bg-white/6 p-3">
            <HeroSummaryCell label="Concluidas" value={`${doneCount}/${total}`} />
            <HeroSummaryCell label="Pendentes" value={String(pendingCount)} />
            <HeroSummaryCell label="Alertas" value={String(alertItems.length)} />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-foreground">Alertas de prazo</p>
          </div>
          <p className="text-xs font-semibold text-muted-foreground">
            {alertItems.length} {alertItems.length === 1 ? "item" : "itens"}
          </p>
        </div>

        <div className="space-y-3">
          {alertItems.length > 0 ? (
            alertItems.slice(0, 3).map((item) => (
              <DeadlineAlertCard
                dateLabel={item.dateLabel}
                detail={item.detail}
                eyebrow={item.eyebrow}
                icon={item.icon}
                key={`${item.title}-${item.dateLabel}`}
                title={item.title}
                tone={item.tone}
              />
            ))
          ) : (
            <Card className="overflow-hidden rounded-[28px]">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="icon-tile flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-success/12 text-success">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground">Nenhum prazo critico agora</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Alertas e progresso seguem ligados aos estados reais do checklist e das obrigacoes do app.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      <Card className="overflow-hidden rounded-[32px]">
        <CardContent className="p-0">
          <div className="border-b border-border/60 px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-3 min-[430px]:flex-row min-[430px]:items-start min-[430px]:justify-between">
              <div className="space-y-1">
                <h2 className="text-lg font-extrabold tracking-tight text-foreground">Checklist do mes</h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  Toque para marcar como concluida e acompanhe o que ainda falta neste ciclo.
                </p>
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
                {pendingCount === 0 ? "Tudo em dia" : `${pendingCount} pendente${pendingCount === 1 ? "" : "s"}`}
              </Badge>
            </div>
          </div>

          <div className="px-5 py-5 sm:px-6">
            <ObrigacoesChecklist items={checklist} monthKey={monthKey} />
          </div>
        </CardContent>
      </Card>

      <ObrigacoesReminders preferences={reminderPreferences} />

      <Card className="overflow-hidden rounded-[30px] border-primary/12 bg-[linear-gradient(180deg,hsl(152_65%_97%)_0%,hsl(150_30%_93%)_100%)]">
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="icon-tile flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-extrabold tracking-tight text-foreground">
                Manter o checklist em dia evita correria e multa
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{supportCopy}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function HeroSummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] bg-white/8 px-3 py-3 text-center">
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/72">{label}</p>
      <p className="mt-1 text-base font-extrabold text-white">{value}</p>
    </div>
  );
}

function DeadlineAlertCard({
  dateLabel,
  detail,
  eyebrow,
  icon: Icon,
  title,
  tone,
}: AlertItem) {
  return (
    <Card className="overflow-hidden rounded-[28px]">
      <CardContent className="p-0">
        <div className="flex gap-0">
          <div className={cn("w-1.5 shrink-0", getAlertAccentClass(tone))} />
          <div className="flex flex-1 items-start gap-3 px-4 py-4 sm:px-5">
            <div className={cn("icon-tile mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl", getAlertToneClass(tone))}>
              <Icon className="h-5 w-5" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className={cn("text-[11px] font-bold uppercase tracking-[0.08em]", getAlertTextClass(tone))}>{eyebrow}</p>
                <span className="text-xs font-semibold text-muted-foreground">{dateLabel}</span>
              </div>
              <p className="mt-1 text-lg font-extrabold tracking-tight text-foreground">{title}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{detail}</p>
            </div>

            <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function getAlertToneClass(tone: StatusTone) {
  if (tone === "success") {
    return "bg-primary/10 text-primary";
  }

  if (tone === "warning") {
    return "bg-secondary-soft text-secondary-foreground";
  }

  if (tone === "danger") {
    return "bg-destructive/10 text-destructive";
  }

  return "bg-primary-soft text-primary";
}

function getAlertAccentClass(tone: StatusTone) {
  if (tone === "success") {
    return "bg-primary";
  }

  if (tone === "warning") {
    return "bg-secondary";
  }

  if (tone === "danger") {
    return "bg-destructive";
  }

  return "bg-border";
}

function getAlertTextClass(tone: StatusTone) {
  if (tone === "success") {
    return "text-primary";
  }

  if (tone === "warning") {
    return "text-secondary-foreground";
  }

  if (tone === "danger") {
    return "text-destructive";
  }

  return "text-foreground";
}

function getAlertTone(status: DueStatus, daysUntil: number) {
  if (status === "Atrasado" || status === "Hoje") {
    return "danger";
  }

  if (status === "Em breve" && daysUntil <= 3) {
    return "warning";
  }

  return "success";
}

function formatDeadlineLabel(status: DueStatus, daysUntil: number) {
  if (status === "Atrasado") {
    return "Atrasado";
  }

  if (status === "Hoje") {
    return "Vence hoje";
  }

  if (status === "Em breve") {
    return daysUntil === 1 ? "Em 1 dia" : `Em ${daysUntil} dias`;
  }

  if (status === "Concluido") {
    return "Concluido";
  }

  return "No radar";
}

function capitalizeMonthYear(value: string) {
  return value
    .split(" ")
    .map((part, index) => (index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}
