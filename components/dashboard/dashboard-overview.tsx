import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Landmark,
  Receipt,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { DashboardGreeting } from "@/components/dashboard/dashboard-greeting";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Movimentacao } from "@/types/database";

type RecentMovement = Pick<
  Movimentacao,
  "amount" | "description" | "id" | "occurred_at" | "occurred_on" | "type"
>;

type DashboardOverviewProps = {
  annualIncome: number;
  checklistDoneCount: number;
  currentBalance: number;
  dasDone: boolean;
  monthlyIncome: number;
  monthlyExpense: number;
  recentMovements: RecentMovement[];
};

const DAS_DUE_DAY = 20;
const MEI_LIMIT = 81000;
const DASHBOARD_CHECKLIST_ITEMS = 6;

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function toCurrency(value: number) {
  return currencyFormatter.format(value);
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

export function DashboardOverview({
  annualIncome,
  checklistDoneCount,
  currentBalance,
  dasDone,
  monthlyExpense,
  monthlyIncome,
  recentMovements,
}: DashboardOverviewProps) {
  const monthBalance = monthlyIncome - monthlyExpense;
  const limitUsage = annualIncome / MEI_LIMIT;
  const limitUsagePercent = Math.min(limitUsage * 100, 100);
  const remainingLimit = Math.max(MEI_LIMIT - annualIncome, 0);
  const today = new Date();
  const dasLate = !dasDone && today.getDate() > DAS_DUE_DAY;

  const alerts = [
    {
      description:
        monthBalance >= 0
          ? "As entradas do mes estao cobrindo as despesas registradas."
          : "Revise as despesas antes de fechar o mes.",
      icon: monthBalance >= 0 ? CheckCircle2 : Wallet,
      label: monthBalance >= 0 ? "Mes no azul" : "Mes pede atencao",
      tone: monthBalance >= 0 ? "success" : "danger",
    },
    {
      description: `${limitUsagePercent.toFixed(1).replace(".", ",")}% do limite anual utilizado.`,
      icon: TrendingUp,
      label:
        limitUsage >= 1 ? "Limite ultrapassado" : limitUsage >= 0.75 ? "Limite no radar" : "Limite sob controle",
      tone: limitUsage >= 1 ? "danger" : limitUsage >= 0.75 ? "warning" : "success",
    },
    {
      description: dasDone
        ? "O DAS ja esta marcado como pago no checklist."
        : dasLate
          ? "Abra obrigacoes e atualize o item do DAS."
          : "Marque no checklist assim que concluir o pagamento.",
      icon: Receipt,
      label: dasDone ? "DAS em dia" : dasLate ? "DAS em aberto" : "DAS no radar",
      tone: dasDone ? "success" : dasLate ? "danger" : "warning",
    },
  ] as const;

  return (
    <div className="mobile-section-gap">
      <section className="summary-shell relative overflow-hidden rounded-[32px] p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-10 top-0 h-36 w-36 rounded-full bg-secondary/12 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 left-0 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <Badge className="hero-pill w-fit" variant="secondary">
                <Sparkles className="mr-1 h-3 w-3" />
                Visao geral
              </Badge>
              <div className="space-y-1">
                <DashboardGreeting />
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  Entradas, despesas, fechamento e limite do MEI em uma leitura so.
                </p>
              </div>
            </div>
            <div className="hero-panel w-full rounded-[24px] px-4 py-3 sm:w-auto sm:px-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-primary/70">
                Saldo atual
              </p>
              <p
                className={cn(
                  "font-mono mt-1 text-2xl font-extrabold tabular",
                  currentBalance >= 0 ? "text-foreground" : "text-destructive",
                )}
              >
                {toCurrency(currentBalance)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              detail="registrado neste mes"
              icon={ArrowDownLeft}
              label="Entradas"
              tone="success"
              value={toCurrency(monthlyIncome)}
            />
            <SummaryCard
              detail="registrado neste mes"
              icon={ArrowUpRight}
              label="Despesas"
              tone="danger"
              value={toCurrency(monthlyExpense)}
            />
            <SummaryCard
              detail={monthBalance >= 0 ? "mes no azul" : "mes no vermelho"}
              icon={Wallet}
              label="Saldo do mes"
              tone={monthBalance >= 0 ? "primary" : "danger"}
              value={toCurrency(monthBalance)}
            />
            <SummaryCard
              detail="acumulado em 2025"
              icon={Landmark}
              label="Faturamento"
              tone="neutral"
              value={toCurrency(annualIncome)}
            />
          </div>
        </div>
      </section>

      <section>
        <Card className="summary-shell overflow-hidden">
          <CardContent className="space-y-5 p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <p className="hero-kicker text-[11px] font-bold uppercase tracking-[0.1em]">
                  Limite anual MEI
                </p>
                <p className="font-mono text-3xl font-extrabold tabular">{toCurrency(annualIncome)}</p>
                <p className="text-sm text-muted-foreground">de {toCurrency(MEI_LIMIT)} utilizados no ano</p>
              </div>
              <Badge className="hero-pill w-fit self-start" variant="secondary">
                {limitUsage >= 1 ? "Excedido" : limitUsage >= 0.75 ? "Atencao" : "Tranquilo"}
              </Badge>
            </div>

            <div className="hero-panel rounded-[24px] p-4 sm:p-5">
              <div className="space-y-2">
                <div className="h-3 overflow-hidden rounded-full bg-muted/80">
                  <div className="h-full rounded-full bg-gradient-glow" style={{ width: `${limitUsagePercent}%` }} />
                </div>
                <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                  <span>{limitUsagePercent.toFixed(1).replace(".", ",")}% do teto</span>
                  <span>{toCurrency(remainingLimit)} disponiveis</span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <LimitStat label="Checklist" value={`${Math.min(checklistDoneCount, DASHBOARD_CHECKLIST_ITEMS)}/${DASHBOARD_CHECKLIST_ITEMS}`} />
                <LimitStat label="Restante" value={toCurrency(remainingLimit)} />
                <LimitStat label="Saldo" value={toCurrency(currentBalance)} />
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardContent className="p-5 sm:p-6">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  Ultimas movimentacoes
                </p>
                <h2 className="mt-1 text-lg font-extrabold tracking-tight text-foreground">O que entrou e saiu</h2>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href="/app/movimentacoes">Ver tudo</Link>
              </Button>
            </div>

            {recentMovements.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-border bg-muted/40 p-5 text-sm leading-6 text-muted-foreground">
                <p className="font-bold text-foreground">Nenhuma movimentacao registrada ainda.</p>
                <p className="mt-1">Adicione sua primeira entrada ou despesa para alimentar o painel.</p>
                <Button asChild className="mt-4" size="sm">
                  <Link href="/app/movimentacoes">Adicionar movimentacao</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {recentMovements.map((movement) => {
                  const income = movement.type === "entrada";

                  return (
                    <div className="surface-panel-muted flex items-center gap-3 rounded-[24px] px-4 py-3.5 transition-colors hover:border-primary/20 hover:bg-primary-soft/20" key={movement.id}>
                      <div
                        className={cn(
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                          income ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
                        )}
                      >
                        {income ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-foreground">{movement.description}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {income ? "Entrada" : "Despesa"} -{" "}
                          {movement.occurred_at ? toDateTime(movement.occurred_at) : toDate(movement.occurred_on)}
                        </p>
                      </div>
                      <p className={cn("font-mono text-sm font-extrabold tabular", income ? "text-success" : "text-foreground")}>
                        {income ? "+" : "-"} {toCurrency(movement.amount)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5 sm:p-6">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                Alertas e status
              </p>
              <h2 className="mt-1 text-lg font-extrabold tracking-tight text-foreground">O que merece sua atencao</h2>
            </div>
            {alerts.map((alert) => {
              const Icon = alert.icon;

              return (
                <div className="surface-panel flex gap-3 rounded-[24px] p-4" key={alert.label}>
                  <div
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
                      alert.tone === "success" && "bg-success/10 text-success",
                      alert.tone === "warning" && "bg-secondary-soft text-secondary-foreground",
                      alert.tone === "danger" && "bg-destructive/10 text-destructive",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground">{alert.label}</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{alert.description}</p>
                  </div>
                </div>
              );
            })}
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
  value,
}: {
  detail: string;
  icon: typeof ArrowDownLeft;
  label: string;
  tone: "success" | "danger" | "primary" | "neutral";
  value: string;
}) {
  return (
    <div className="hero-panel rounded-[24px] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-primary/70">{label}</p>
          <p className="font-mono mt-2 text-xl font-extrabold tabular text-foreground">{value}</p>
          <p className="mt-1 text-xs text-primary/70">{detail}</p>
        </div>
        <div
          className={cn(
            "icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
            tone === "success" && "bg-success/12 text-success",
            tone === "danger" && "bg-destructive/12 text-destructive",
            tone === "primary" && "bg-primary-soft text-primary",
            tone === "neutral" && "bg-secondary-soft text-secondary-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function LimitStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="hero-panel-soft min-w-0 rounded-[22px] p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}
