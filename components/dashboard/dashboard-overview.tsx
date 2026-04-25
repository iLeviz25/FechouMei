import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Landmark,
  Receipt,
  Sparkles,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { DashboardGreeting } from "@/components/dashboard/dashboard-greeting";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getMeiLimitInfo, MEI_ANNUAL_LIMIT } from "@/lib/mei-limit";
import { getMovementVisualTone } from "@/lib/movement-visuals";
import { cn } from "@/lib/utils";
import type { Movimentacao } from "@/types/database";

type RecentMovement = Pick<
  Movimentacao,
  "amount" | "category" | "description" | "id" | "occurred_at" | "occurred_on" | "type"
>;

type DashboardOverviewProps = {
  annualIncome: number;
  checklistDoneCount: number;
  currentBalance: number;
  dasDone: boolean;
  monthlyIncome: number;
  monthlyExpense: number;
  previousMonthExpense: number;
  previousMonthIncome: number;
  recentMovements: RecentMovement[];
};

const DAS_DUE_DAY = 20;
const DASHBOARD_CHECKLIST_ITEMS = 6;

const compactCurrencyFormatter = new Intl.NumberFormat("pt-BR", {
  compactDisplay: "short",
  currency: "BRL",
  maximumFractionDigits: 1,
  notation: "compact",
  style: "currency",
});

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency",
});

const quickActions = [
  {
    href: "/app/movimentacoes",
    icon: ArrowDownLeft,
    label: "Entrada",
    tone: "success",
  },
  {
    href: "/app/obrigacoes",
    icon: Receipt,
    label: "Pagar DAS",
    tone: "warning",
  },
  {
    href: "/app/fechamento-mensal",
    icon: Landmark,
    label: "Fechar mes",
    tone: "neutral",
  },
  {
    href: "/app/movimentacoes",
    icon: ArrowUpRight,
    label: "Despesa",
    tone: "danger",
  },
] as const;

function toCurrency(value: number) {
  return currencyFormatter.format(value);
}

function toCompactCurrency(value: number) {
  return compactCurrencyFormatter.format(value);
}

function toDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function toDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function normalizeLabel(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function toHeadlineDate(value: Date) {
  return normalizeLabel(
    new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "long",
      timeZone: "America/Sao_Paulo",
      weekday: "long",
    }).format(value),
  ).toUpperCase();
}

function toMonthCardLabel(value: Date) {
  return normalizeLabel(
    new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      timeZone: "America/Sao_Paulo",
      year: "numeric",
    }).format(value),
  ).replace(" de ", "/");
}

function toMonthName(value: Date) {
  return normalizeLabel(
    new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      timeZone: "America/Sao_Paulo",
    }).format(value),
  );
}

function getDashboardMovementTone(type: RecentMovement["type"]) {
  const tone = getMovementVisualTone(type);

  return {
    ...tone,
    hoverClass: type === "entrada" ? "hover:bg-primary/5" : "hover:bg-destructive/5",
  } as const;
}

function getMetricDelta(
  current: number,
  previous: number,
  direction: "higher-is-better" | "lower-is-better",
) {
  if (previous === 0) {
    return null;
  }

  const variation = ((current - previous) / Math.abs(previous)) * 100;
  const positiveOutcome = direction === "higher-is-better" ? variation >= 0 : variation <= 0;

  return {
    label: `${variation > 0 ? "+" : ""}${variation.toFixed(1).replace(".", ",")}%`,
    tone: positiveOutcome ? "success" : "danger",
  } as const;
}

function getDashboardStatus({
  dasDone,
  dasLate,
  limitUsage,
  monthBalance,
}: {
  dasDone: boolean;
  dasLate: boolean;
  limitUsage: number;
  monthBalance: number;
}) {
  if (dasLate || limitUsage >= 1 || monthBalance < 0) {
    return { label: "Atencao", tone: "danger" } as const;
  }

  if (!dasDone || limitUsage >= 0.75) {
    return { label: "No radar", tone: "warning" } as const;
  }

  return { label: "Tudo em dia", tone: "success" } as const;
}

export function DashboardOverview({
  annualIncome,
  checklistDoneCount,
  currentBalance,
  dasDone,
  monthlyExpense,
  monthlyIncome,
  previousMonthExpense,
  previousMonthIncome,
  recentMovements,
}: DashboardOverviewProps) {
  const monthBalance = monthlyIncome - monthlyExpense;
  const limitInfo = getMeiLimitInfo(annualIncome);
  const limitUsage = limitInfo.usage;
  const limitUsageDisplayPercent = limitInfo.usageDisplayPercent;
  const limitUsagePercent = limitInfo.usagePercent;
  const remainingLimit = limitInfo.remainingLimit;
  const exceededLimit = limitInfo.exceededLimit;
  const today = new Date();
  const dasLate = !dasDone && today.getDate() > DAS_DUE_DAY;
  const currentYear = today.getFullYear();
  const currentMonthLabel = toMonthCardLabel(today);
  const previousMonthBalance = previousMonthIncome - previousMonthExpense;
  const status = getDashboardStatus({
    dasDone,
    dasLate,
    limitUsage,
    monthBalance,
  });
  const limitStatus = limitInfo.status;

  const alerts = [
    {
      cta: dasDone ? "Abrir obrigacoes" : "Pagar agora",
      description: dasDone
        ? "O pagamento mensal ja foi marcado no checklist deste mes."
        : dasLate
          ? "O prazo do DAS passou. Entre em obrigacoes para regularizar sem perder o controle."
          : `O DAS de ${toMonthName(today)} ainda esta em aberto. Atualize o checklist assim que concluir o pagamento.`,
      href: "/app/obrigacoes",
      icon: dasDone ? CheckCircle2 : Receipt,
      kicker: dasDone ? "TUDO CERTO" : dasLate ? "URGENTE" : "ATENCAO",
      title: dasDone ? "DAS do mes sinalizado" : `DAS de ${toMonthName(today)} em aberto`,
      tone: dasDone ? "success" : dasLate ? "danger" : "warning",
    },
    {
      cta: "Ver projecao",
      description:
        limitUsage >= 1
          ? `Seu faturamento anual passou do teto do MEI em ${toCurrency(exceededLimit)}. Revise o fechamento para decidir os proximos passos.`
          : `${limitUsageDisplayPercent.toFixed(1).replace(".", ",")}% do limite anual usado. Ainda restam ${toCurrency(remainingLimit)} no teto.`,
      href: "/app/fechamento-mensal",
      icon: TrendingUp,
      kicker: limitUsage >= 1 ? "URGENTE" : limitUsage >= 0.75 ? "ATENCAO" : "TUDO CERTO",
      title:
        limitUsage >= 1
          ? "Limite do MEI ultrapassado"
          : limitUsage >= 0.75
            ? "Limite do MEI no radar"
            : "Limite do MEI sob controle",
      tone: limitUsage >= 1 ? "danger" : limitUsage >= 0.75 ? "warning" : "success",
    },
    {
      cta: monthBalance >= 0 ? "Ver movimentacoes" : "Revisar mes",
      description:
        monthBalance >= 0
          ? `Voce fecha o mes com ${toCurrency(monthBalance)} acima das despesas registradas.`
          : `As despesas passaram as entradas em ${toCurrency(Math.abs(monthBalance))}. Vale revisar os lancamentos antes do fechamento.`,
      href: monthBalance >= 0 ? "/app/movimentacoes" : "/app/fechamento-mensal",
      icon: monthBalance >= 0 ? CheckCircle2 : AlertTriangle,
      kicker: monthBalance >= 0 ? "TUDO CERTO" : "ATENCAO",
      title: monthBalance >= 0 ? "Saldo saudavel neste mes" : "Saldo do mes pede revisao",
      tone: monthBalance >= 0 ? "success" : "warning",
    },
  ] as const;

  return (
    <div className="mobile-section-gap mx-auto w-full max-w-[430px] px-1 sm:max-w-none sm:px-0">
      <section className="space-y-4 px-1">
        <div className="space-y-3">
          <div className="min-w-0 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary/75">
              {toHeadlineDate(today)}
            </p>
            <div className="space-y-2">
              <DashboardGreeting />
              <p className="max-w-[18rem] text-sm leading-6 text-muted-foreground">
                Aqui esta o resumo do seu MEI hoje.
              </p>
            </div>
          </div>
          <DashboardStatusPill label={status.label} tone={status.tone} />
        </div>

        <div className="surface-panel-ghost inline-flex max-w-full items-center gap-2 rounded-full px-3.5 py-2">
          <Wallet className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-xs font-semibold text-muted-foreground">Saldo atual</span>
          <span
            className={cn(
              "font-mono truncate text-sm font-extrabold tabular",
              currentBalance >= 0 ? "text-foreground" : "text-destructive",
            )}
          >
            {toCurrency(currentBalance)}
          </span>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
        <SummaryCard
          detail={currentMonthLabel}
          icon={ArrowDownLeft}
          label="Entradas"
          tone="success"
          trend={getMetricDelta(monthlyIncome, previousMonthIncome, "higher-is-better")}
          value={toCurrency(monthlyIncome)}
        />
        <SummaryCard
          detail={currentMonthLabel}
          icon={ArrowUpRight}
          label="Despesas"
          tone="danger"
          trend={getMetricDelta(monthlyExpense, previousMonthExpense, "lower-is-better")}
          value={toCurrency(monthlyExpense)}
        />
        <SummaryCard
          detail={monthBalance >= 0 ? "entradas - despesas" : "requer revisao do mes"}
          icon={Wallet}
          label="Saldo do mes"
          tone="neutral"
          trend={getMetricDelta(monthBalance, previousMonthBalance, "higher-is-better")}
          value={toCurrency(monthBalance)}
          valueTone={monthBalance >= 0 ? "neutral" : "danger"}
        />
        <SummaryCard
          detail={`acumulado ${currentYear}`}
          icon={Landmark}
          label="Faturamento"
          tone="warning"
          trendLabel={
            exceededLimit > 0
              ? `${toCurrency(exceededLimit)} acima do teto`
              : remainingLimit > 0
                ? `${toCurrency(remainingLimit)} livres no teto`
                : "Teto anual atingido"
          }
          value={toCurrency(annualIncome)}
          valueTone="warning"
        />
      </section>

      <section>
        <Card className="overflow-hidden rounded-[30px]">
          <CardContent className="space-y-4 p-4 min-[380px]:space-y-5 min-[380px]:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-primary/70">
                  Acoes rapidas
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Atalhos para o que voce resolve primeiro no celular.
                </p>
              </div>
              <div className="icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 min-[430px]:grid-cols-4">
              {quickActions.map((action) => (
                <QuickActionCard key={action.label} {...action} />
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <div className="relative overflow-hidden rounded-[30px] bg-gradient-hero px-4 py-4 text-primary-foreground shadow-elevated min-[380px]:px-5 sm:py-5">
          <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(hsl(0_0%_100%/0.08)_1px,transparent_1px),linear-gradient(90deg,hsl(0_0%_100%/0.08)_1px,transparent_1px)] [background-size:22px_22px]" />
          <div className="pointer-events-none absolute -right-16 top-0 h-40 w-40 rounded-full bg-[radial-gradient(circle,hsl(38_95%_55%/0.22)_0%,transparent_70%)]" />
          <div className="pointer-events-none absolute -bottom-20 left-0 h-44 w-44 rounded-full bg-[radial-gradient(circle,hsl(0_0%_100%/0.14)_0%,transparent_70%)]" />

          <div className="relative space-y-4 sm:space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge
                className="w-fit border-white/12 bg-white/8 px-2.5 py-1 text-[10px] tracking-[0.12em] text-primary-foreground"
                variant="outline"
              >
                Limite anual MEI . {currentYear}
              </Badge>
              <Badge
                className={cn(
                  "w-fit shrink-0 border-0 px-2.5 py-1 text-[10px] tracking-[0.08em] shadow-none",
                  limitStatus.badgeClass,
                )}
                variant="outline"
              >
                {limitStatus.label}
              </Badge>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <p className="text-[13px] font-semibold text-primary-foreground/82 sm:text-sm">Faturamento acumulado</p>
                <p className="font-mono text-[1.95rem] font-extrabold leading-none tabular min-[380px]:text-[2.15rem] sm:text-[2.25rem]">
                  {toCurrency(annualIncome)}
                </p>
                <p className="text-xs text-primary-foreground/72 sm:text-sm">
                  de {toCurrency(MEI_ANNUAL_LIMIT)} no teto anual
                </p>
              </div>

              <div className="space-y-2.5">
                <div className="h-3 overflow-hidden rounded-full bg-white/14">
                  <div
                    className={cn("h-full rounded-full", limitStatus.progressClass)}
                    style={{ width: `${limitUsagePercent}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 text-primary-foreground/82 sm:flex sm:items-center sm:justify-between sm:gap-3">
                  <div className="rounded-[18px] bg-white/8 px-3 py-2 sm:rounded-none sm:bg-transparent sm:px-0 sm:py-0">
                    <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-primary-foreground/58 sm:hidden">
                      Uso
                    </p>
                    <p className="mt-1 text-sm font-semibold text-primary-foreground sm:mt-0 sm:text-sm">
                      {limitUsageDisplayPercent.toFixed(1).replace(".", ",")}% do teto
                    </p>
                  </div>
                  <div className="rounded-[18px] bg-white/8 px-3 py-2 text-right sm:rounded-none sm:bg-transparent sm:px-0 sm:py-0 sm:text-left">
                    <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-primary-foreground/58 sm:hidden">
                      {exceededLimit > 0 ? "Excedido" : "Disponivel"}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-primary-foreground sm:mt-0 sm:text-sm">
                      {exceededLimit > 0 ? `${toCurrency(exceededLimit)} acima` : `${toCurrency(remainingLimit)} disponiveis`}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 border-t border-white/12 pt-3.5 sm:gap-3 sm:pt-4">
              <LimitMetric label="Ja usado" value={toCompactCurrency(annualIncome)} />
              <LimitMetric label="Restante" value={toCompactCurrency(remainingLimit)} />
              <LimitMetric
                label="Checklist"
                value={`${Math.min(checklistDoneCount, DASHBOARD_CHECKLIST_ITEMS)}/${DASHBOARD_CHECKLIST_ITEMS}`}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="flex flex-col gap-3 px-4 pb-4 pt-5 min-[430px]:flex-row min-[430px]:items-start min-[430px]:justify-between min-[380px]:px-5">
              <div>
                <h2 className="text-[1.1rem] font-extrabold tracking-tight text-foreground">
                  Ultimas movimentacoes
                </h2>
                <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  Sincronizado agora
                </p>
              </div>
              <Button
                asChild
                className="h-auto self-start rounded-full px-0 text-primary hover:bg-transparent"
                size="sm"
                variant="ghost"
              >
                <Link href="/app/movimentacoes">
                  Ver tudo
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            {recentMovements.length === 0 ? (
              <div className="border-t border-border/70 px-4 py-5 text-sm leading-6 text-muted-foreground min-[380px]:px-5">
                <p className="font-bold text-foreground">Nenhuma movimentacao registrada ainda.</p>
                <p className="mt-1">Adicione sua primeira entrada ou despesa para alimentar o painel.</p>
                <Button asChild className="mt-4" size="sm">
                  <Link href="/app/movimentacoes">Adicionar movimentacao</Link>
                </Button>
              </div>
            ) : (
              <div className="border-t border-border/70">
                {recentMovements.map((movement) => (
                  <RecentMovementRow key={movement.id} movement={movement} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[1.1rem] font-extrabold tracking-tight text-foreground">
                  Alertas e status
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Acompanhe o que precisa da sua atencao.
                </p>
              </div>
              <div className="flex h-9 min-w-9 items-center justify-center rounded-full bg-primary-soft px-3 text-sm font-extrabold text-primary">
                {alerts.length}
              </div>
            </div>

            <div className="space-y-3">
              {alerts.map((alert) => (
                <AlertCard key={alert.title} {...alert} />
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function SummaryCard({
  detail,
  icon: Icon,
  label,
  tone,
  trend,
  trendLabel,
  valueTone,
  value,
}: {
  detail: string;
  icon: typeof ArrowDownLeft;
  label: string;
  tone: "success" | "danger" | "neutral" | "warning";
  trend?: ReturnType<typeof getMetricDelta> | null;
  trendLabel?: string;
  valueTone?: "success" | "danger" | "neutral" | "warning";
  value: string;
}) {
  const resolvedValueTone = valueTone ?? tone;

  return (
    <div
      className={cn(
        "min-h-[154px] rounded-[24px] border p-4 min-[480px]:min-h-[168px] sm:p-5",
        tone === "success" &&
          "border-primary/14 bg-[linear-gradient(180deg,hsl(152_62%_96%)_0%,hsl(152_38%_92%)_100%)]",
        tone === "danger" &&
          "border-destructive/16 bg-[linear-gradient(180deg,hsl(0_100%_99%)_0%,hsl(0_82%_95%)_100%)]",
        tone === "neutral" &&
          "border-border/90 bg-[linear-gradient(180deg,hsl(0_0%_100%)_0%,hsl(150_16%_95%)_100%)]",
        tone === "warning" &&
          "border-secondary/20 bg-[linear-gradient(180deg,hsl(46_100%_98%)_0%,hsl(40_95%_92%)_100%)]",
      )}
    >
      <div className="flex h-full flex-col justify-between gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              className={cn(
                "text-[11px] font-bold uppercase tracking-[0.08em]",
                tone === "success" && "text-primary/80",
                tone === "danger" && "text-destructive/80",
                tone === "neutral" && "text-foreground/60",
                tone === "warning" && "text-secondary-foreground/80",
              )}
            >
              {label}
            </p>
            <p
              className={cn(
                "font-mono mt-2 text-[1.45rem] font-extrabold leading-none tabular min-[480px]:text-[1.75rem]",
                resolvedValueTone === "success" && "text-primary",
                resolvedValueTone === "danger" && "text-destructive",
                resolvedValueTone === "neutral" && "text-foreground",
                resolvedValueTone === "warning" && "text-secondary-foreground",
              )}
            >
              {value}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
          </div>
          <div
            className={cn(
              "icon-tile flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
              tone === "success" && "bg-white/72 text-primary",
              tone === "danger" && "bg-white/75 text-destructive",
              tone === "neutral" && "bg-white/80 text-foreground",
              tone === "warning" && "bg-white/75 text-secondary-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
        </div>

        <div className="min-w-0">
          {trend ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold",
                  trend.tone === "success" && "bg-primary-soft text-primary",
                  trend.tone === "danger" && "bg-destructive/10 text-destructive",
                )}
              >
                <TrendingUp className="h-3 w-3" />
                {trend.label}
              </span>
              <span className="text-muted-foreground">vs. mes anterior</span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{trendLabel ?? "Sem base anterior"}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function QuickActionCard({
  href,
  icon: Icon,
  label,
  tone,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  tone: "success" | "warning" | "neutral" | "danger";
}) {
  return (
    <Link
      className="group flex min-w-0 flex-col items-center gap-2 rounded-[22px] px-2 py-2.5 text-center transition-colors hover:bg-primary-soft/25"
      href={href}
    >
      <div
        className={cn(
          "icon-tile flex h-12 w-12 items-center justify-center rounded-[18px] border transition-transform duration-200 group-hover:-translate-y-0.5 min-[380px]:h-14 min-[380px]:w-14 min-[380px]:rounded-[20px]",
          tone === "success" && "border-primary/14 bg-primary/10 text-primary",
          tone === "warning" && "border-secondary/18 bg-secondary-soft text-secondary-foreground",
          tone === "neutral" && "border-border/80 bg-white/88 text-foreground",
          tone === "danger" && "border-destructive/14 bg-destructive/10 text-destructive",
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <span className="text-[12px] font-semibold leading-4 text-foreground min-[380px]:text-[13px]">{label}</span>
    </Link>
  );
}

function RecentMovementRow({ movement }: { movement: RecentMovement }) {
  const income = movement.type === "entrada";
  const tone = getDashboardMovementTone(movement.type);

  return (
    <Link
      className={cn(
        "group block border-b border-border/70 px-4 py-3.5 transition-colors last:border-b-0 min-[380px]:px-5",
        tone.hoverClass,
      )}
      href="/app/movimentacoes"
    >
      <div className="flex gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
            tone.iconClass,
          )}
        >
          {income ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={tone.badgeClass} variant="outline">
              {tone.label}
            </Badge>
            <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {movement.category}
            </span>
            <span className="text-xs text-muted-foreground">
              {movement.occurred_at ? toDateTime(movement.occurred_at) : toDate(movement.occurred_on)}
            </span>
          </div>

          <div className="mt-2 flex flex-col gap-2 min-[430px]:flex-row min-[430px]:items-start min-[430px]:justify-between">
            <p className="min-w-0 text-[15px] font-semibold leading-6 text-foreground">
              {movement.description}
            </p>
            <div className="flex items-center gap-1.5 self-start min-[430px]:pl-3">
              <p className={cn("font-mono whitespace-nowrap text-sm font-extrabold tabular", tone.amountClass)}>
                {income ? "+" : "-"} {toCurrency(movement.amount)}
              </p>
              <ChevronRight className="h-4 w-4 text-muted-foreground/70 transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function AlertCard({
  cta,
  description,
  href,
  icon: Icon,
  kicker,
  title,
  tone,
}: {
  cta: string;
  description: string;
  href: string;
  icon: LucideIcon;
  kicker: string;
  title: string;
  tone: "success" | "warning" | "danger";
}) {
  return (
    <div className="surface-panel-ghost rounded-[24px] p-4">
      <div className="flex gap-3">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
            tone === "success" && "bg-success/10 text-success",
            tone === "warning" && "bg-secondary-soft text-secondary-foreground",
            tone === "danger" && "bg-destructive/10 text-destructive",
          )}
        >
          <Icon className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <Badge
            className={cn(
              "mb-3 w-fit border-0 px-2 py-0.5 shadow-none",
              tone === "success" && "bg-success/12 text-success",
              tone === "warning" && "bg-secondary-soft text-secondary-foreground",
              tone === "danger" && "bg-destructive/10 text-destructive",
            )}
            variant="outline"
          >
            {kicker}
          </Badge>
          <p className="text-base font-bold text-foreground">{title}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
          <Link className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary" href={href}>
            {cta}
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function DashboardStatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "success" | "warning" | "danger";
}) {
  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold shadow-[inset_0_1px_0_hsl(0_0%_100%/0.45)]",
        tone === "success" && "border-success/20 bg-success/10 text-success",
        tone === "warning" && "border-secondary/25 bg-secondary-soft text-secondary-foreground",
        tone === "danger" && "border-destructive/20 bg-destructive/10 text-destructive",
      )}
    >
      <span className="h-2.5 w-2.5 rounded-full bg-current" />
      {label}
    </div>
  );
}

function LimitMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[18px] bg-white/8 px-2.5 py-2.5 sm:rounded-none sm:bg-transparent sm:px-0 sm:py-0">
      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-primary-foreground/58 sm:text-[10px]">
        {label}
      </p>
      <p className="mt-1.5 font-mono text-[13px] font-bold leading-tight text-primary-foreground min-[380px]:text-sm sm:mt-2 sm:text-base">
        {value}
      </p>
    </div>
  );
}
