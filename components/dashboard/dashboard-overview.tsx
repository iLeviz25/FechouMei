import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
  Landmark,
  Plus,
  ReceiptText,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { DashboardGreeting } from "@/components/dashboard/dashboard-greeting";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
const MEI_ANNUAL_LIMIT = 81000;
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
  const balance = monthlyIncome - monthlyExpense;
  const hasMovementsThisMonth = monthlyIncome > 0 || monthlyExpense > 0;
  const limitUsage = annualIncome / MEI_ANNUAL_LIMIT;
  const limitUsagePercent = Math.min(limitUsage * 100, 100);
  const remainingLimit = Math.max(MEI_ANNUAL_LIMIT - annualIncome, 0);
  const today = new Date();
  const dasIsLate = !dasDone && today.getDate() > DAS_DUE_DAY;
  const checklistProgress = Math.min(checklistDoneCount, DASHBOARD_CHECKLIST_ITEMS);

  const limitStatus =
    limitUsage >= 1
      ? "Limite ultrapassado"
      : limitUsage >= 0.9
        ? "Limite próximo"
        : limitUsage >= 0.75
          ? "Atenção"
          : "Sem alerta";
  const limitStatusVariant =
    limitUsage >= 1 ? "danger" : limitUsage >= 0.75 ? "warning" : "success";
  const limitBarTone =
    limitUsage >= 1 ? "bg-red-400" : limitUsage >= 0.75 ? "bg-amber-300" : "bg-emerald-400";

  const summaryCards = [
    {
      bar: "bg-emerald-600",
      detail: monthlyIncome > 0 ? "Entrou neste mês" : "Sem entradas no mês",
      icon: ArrowUpRight,
      iconTone: "border-emerald-100 bg-emerald-50 text-emerald-700",
      title: "Entradas",
      value: toCurrency(monthlyIncome),
      valueTone: "text-emerald-800",
    },
    {
      bar: "bg-red-500",
      detail: monthlyExpense > 0 ? "Saiu neste mês" : "Sem despesas no mês",
      icon: ArrowDownLeft,
      iconTone: "border-red-100 bg-red-50 text-red-700",
      title: "Despesas",
      value: toCurrency(monthlyExpense),
      valueTone: "text-red-700",
    },
    {
      bar: balance >= 0 ? "bg-neutral-800" : "bg-red-500",
      detail: balance >= 0 ? "Mês no azul" : "Mês no vermelho",
      icon: Wallet,
      iconTone:
        balance >= 0
          ? "border-neutral-200 bg-neutral-50 text-neutral-800"
          : "border-red-100 bg-red-50 text-red-700",
      title: "Saldo do mês",
      value: toCurrency(balance),
      valueTone: balance >= 0 ? "text-neutral-950" : "text-red-700",
    },
    {
      bar: "bg-amber-500",
      detail: "Para o limite do MEI",
      icon: Landmark,
      iconTone: "border-amber-100 bg-amber-50 text-amber-700",
      title: "Faturamento no ano",
      value: toCurrency(annualIncome),
      valueTone: "text-neutral-950",
    },
  ];

  const alertItems = [
    {
      detail: hasMovementsThisMonth
        ? balance >= 0
          ? "Entradas estão cobrindo as despesas registradas."
          : "Revise despesas antes de fechar o mês."
        : "Lance uma entrada ou despesa para começar.",
      icon: hasMovementsThisMonth && balance >= 0 ? CheckCircle2 : AlertTriangle,
      tone: hasMovementsThisMonth && balance >= 0 ? "text-emerald-700" : "text-amber-700",
      title: hasMovementsThisMonth ? (balance >= 0 ? "Saldo positivo" : "Saldo negativo") : "Sem lançamentos",
    },
    {
      detail: `${limitUsagePercent.toFixed(1).replace(".", ",")}% do limite anual usado.`,
      icon: limitUsage >= 0.75 ? AlertTriangle : CheckCircle2,
      tone: limitUsage >= 1 ? "text-red-700" : limitUsage >= 0.75 ? "text-amber-700" : "text-emerald-700",
      title: limitStatus,
    },
    {
      detail: dasDone
        ? "Checklist do mês já marcou o DAS como pago."
        : dasIsLate
          ? "Abra obrigações e atualize o checklist."
          : "Marque como pago quando concluir.",
      icon: dasDone ? CheckCircle2 : ReceiptText,
      tone: dasDone ? "text-emerald-700" : dasIsLate ? "text-red-700" : "text-neutral-700",
      title: dasDone ? "DAS em dia" : dasIsLate ? "DAS em aberto" : "DAS no radar",
    },
  ];

  return (
    <div className="space-y-4 pb-6 sm:space-y-5">
      <div className="rounded-lg border border-neutral-200 bg-[linear-gradient(180deg,#ffffff_0%,#fafafa_100%)] p-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)] sm:p-5">
        <div className="space-y-2">
          <Badge variant="success" className="w-fit px-3 py-1">
            Visão geral
          </Badge>
          <div className="space-y-1.5">
            <DashboardGreeting />
            <p className="max-w-2xl text-sm leading-6 text-neutral-600">
              Entradas, despesas, saldo e limite do MEI em poucos segundos.
            </p>
          </div>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card
              className="relative overflow-hidden border-neutral-200 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.045)]"
              key={card.title}
            >
              <div className={cn("absolute inset-x-0 top-0 h-1", card.bar)} />
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start justify-between gap-2 pt-1">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 sm:text-[11px]">
                      {card.title}
                    </p>
                    <p className={cn("mt-1.5 break-words text-base font-bold leading-tight tabular-nums sm:text-xl", card.valueTone)}>
                      {card.value}
                    </p>
                  </div>
                  <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md border sm:h-8 sm:w-8", card.iconTone)}>
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
                <p className="mt-1.5 text-xs leading-5 text-neutral-600 sm:text-sm">{card.detail}</p>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr] lg:items-start">
        <Card className="overflow-hidden border-neutral-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8faf9_100%)] shadow-[0_10px_24px_rgba(15,23,42,0.055)]">
          <CardHeader className="p-4 pb-2.5 sm:p-5 sm:pb-3">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-neutral-950">Limite do MEI</CardTitle>
                <CardDescription className="text-neutral-600">
                  Entradas do ano para acompanhar o teto de R$ 81 mil.
                </CardDescription>
              </div>
              <Badge variant={limitStatusVariant} className="w-fit">
                {limitStatus}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0 sm:p-5 sm:pt-0">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-2xl font-bold leading-tight tracking-tight text-neutral-950 sm:text-[2rem]">
                  {toCurrency(annualIncome)}
                </p>
                <p className="mt-1 text-sm text-neutral-600">já usado no limite</p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-emerald-100 bg-emerald-50 text-emerald-700 sm:h-11 sm:w-11">
                <CircleDollarSign className="h-5 w-5" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="h-2.5 overflow-hidden rounded-md bg-neutral-200">
                <div className={`h-full ${limitBarTone}`} style={{ width: `${limitUsagePercent}%` }} />
              </div>
              <div className="flex justify-between gap-3 text-xs font-medium text-neutral-500">
                <span>{limitUsagePercent.toFixed(1).replace(".", ",")}% usado</span>
                <span>{toCurrency(remainingLimit)} restante</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <CompactInfo label="Restante" value={toCurrency(remainingLimit)} />
              <CompactInfo label="Limite anual" value={toCurrency(MEI_ANNUAL_LIMIT)} />
              <CompactInfo
                className="col-span-2 sm:col-span-1"
                label="Tarefas do mês"
                value={`${checklistProgress} de ${DASHBOARD_CHECKLIST_ITEMS}`}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-neutral-200 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.045)]">
          <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-neutral-950">Últimos registros</CardTitle>
                <CardDescription>O que entrou ou saiu mais recentemente.</CardDescription>
              </div>
              <Button asChild className="h-8 border-neutral-200 bg-white px-2.5" size="sm" variant="outline">
                <Link href="/app/movimentacoes">Abrir</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-0 sm:p-5 sm:pt-0">
            {recentMovements.length === 0 ? (
              <div className="rounded-md border border-dashed border-neutral-300 bg-neutral-50/70 p-4">
                <p className="text-sm font-medium text-neutral-950">Nenhuma movimentação registrada ainda.</p>
                <p className="mt-1 text-sm leading-6 text-neutral-600">
                  Adicione uma entrada ou despesa para alimentar a visão geral.
                </p>
                <Button asChild className="mt-4 h-9 w-full" size="sm">
                  <Link href="/app/movimentacoes">
                    <Plus className="h-4 w-4" />
                    Adicionar movimentação
                  </Link>
                </Button>
              </div>
            ) : (
              recentMovements.map((movement) => {
                const isIncome = movement.type === "entrada";

                return (
                  <div
                    className={cn(
                      "relative overflow-hidden rounded-md border border-neutral-200 bg-white px-3 py-2.5 pl-4 shadow-[0_3px_10px_rgba(15,23,42,0.035)]",
                      "before:absolute before:inset-y-0 before:left-0 before:w-1",
                      isIncome ? "before:bg-emerald-500" : "before:bg-red-400",
                    )}
                    key={movement.id}
                  >
                    <div className="grid grid-cols-[1fr_auto] gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-neutral-950">{movement.description}</p>
                        <p className="mt-0.5 text-[11px] font-medium text-neutral-500 sm:text-xs">
                          {isIncome ? "Entrada" : "Despesa"} · {movement.occurred_at ? toDateTime(movement.occurred_at) : toDate(movement.occurred_on)}
                        </p>
                      </div>
                      <p
                        className={cn(
                          "shrink-0 text-right text-sm font-bold tabular-nums",
                          isIncome ? "text-emerald-700" : "text-red-600",
                        )}
                      >
                        {toCurrency(movement.amount)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="border-neutral-200 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.045)]">
          <CardHeader className="p-4 pb-2.5 sm:p-5 sm:pb-3">
            <CardTitle className="text-neutral-950">Pontos de atenção</CardTitle>
            <CardDescription className="mt-1">O que vale olhar agora.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 p-4 pt-0 sm:p-5 sm:pt-0">
            {alertItems.map((item) => {
              const Icon = item.icon;
              return (
                <div className="flex gap-2 rounded-md border border-neutral-200 bg-neutral-50/70 p-2.5" key={item.title}>
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white">
                    <Icon className={`h-4 w-4 ${item.tone}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-neutral-950">{item.title}</p>
                    <p className="mt-0.5 text-xs leading-5 text-neutral-600 sm:text-sm">{item.detail}</p>
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

function CompactInfo({
  className,
  label,
  value,
}: {
  className?: string;
  label: string;
  value: string;
}) {
  return (
    <div className={cn("rounded-md border border-neutral-200 bg-white p-2.5 shadow-sm", className)}>
      <p className="text-sm font-semibold text-neutral-950">{value}</p>
      <p className="mt-1 text-[11px] text-neutral-500 sm:text-xs">{label}</p>
    </div>
  );
}
