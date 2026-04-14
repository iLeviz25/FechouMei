import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Landmark,
  Plus,
  ReceiptText,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Movimentacao, Profile } from "@/types/database";

type RecentMovement = Pick<
  Movimentacao,
  "amount" | "description" | "id" | "occurred_on" | "type"
>;

type DashboardOverviewProps = {
  profile: Profile | null;
  annualIncome: number;
  checklistDoneCount: number;
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

function getFirstName(profile: Profile | null) {
  return profile?.full_name?.trim().split(/\s+/)[0] ?? "MEI";
}

export function DashboardOverview({
  annualIncome,
  checklistDoneCount,
  dasDone,
  monthlyExpense,
  monthlyIncome,
  profile,
  recentMovements,
}: DashboardOverviewProps) {
  const balance = monthlyIncome - monthlyExpense;
  const hasMovementsThisMonth = monthlyIncome > 0 || monthlyExpense > 0;
  const limitUsage = annualIncome / MEI_ANNUAL_LIMIT;
  const limitUsagePercent = Math.min(limitUsage * 100, 100);
  const remainingLimit = Math.max(MEI_ANNUAL_LIMIT - annualIncome, 0);
  const today = new Date();
  const dasIsLate = !dasDone && today.getDate() > DAS_DUE_DAY;
  const dasNeedsAttention = !dasDone && today.getDate() >= 15;
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

  const nextAction = !hasMovementsThisMonth
    ? {
        button: "Adicionar movimentação",
        description: "Comece registrando uma entrada ou despesa para o painel do mês ficar útil.",
        href: "/app/movimentacoes",
        icon: Plus,
        label: "Comece aqui",
        title: "Registre o primeiro movimento do mês",
      }
    : limitUsage >= 0.9
      ? {
          button: "Revisar fechamento",
          description: "O acumulado anual está perto do limite. Vale conferir se as entradas estão corretas.",
          href: "/app/fechamento-mensal",
          icon: Landmark,
          label: "Atenção",
          title: "Revise o limite do MEI",
        }
      : dasNeedsAttention
        ? {
            button: "Abrir obrigações",
            description: dasIsLate
              ? "O DAS ainda não foi marcado como pago no checklist deste mês."
              : "O DAS entra no radar nesta parte do mês. Marque quando estiver pago.",
            href: "/app/obrigacoes",
            icon: ReceiptText,
            label: dasIsLate ? "Pendente" : "No radar",
            title: dasIsLate ? "Confira o DAS do mês" : "Deixe o DAS no radar",
          }
        : {
            button: "Ver fechamento",
            description: "Confira o resumo do mês e mantenha os lançamentos prontos para fechar sem planilha.",
            href: "/app/fechamento-mensal",
            icon: CalendarClock,
            label: "Próximo passo",
            title: "Revise o fechamento mensal",
          };

  const summaryCards = [
    {
      detail: monthlyIncome > 0 ? "Receitas registradas neste mes" : "Nenhuma entrada lancada",
      icon: ArrowUpRight,
      iconTone: "bg-emerald-100 text-emerald-600",
      title: "Entradas",
      value: toCurrency(monthlyIncome),
      valueTone: "text-emerald-600",
    },
    {
      detail: monthlyExpense > 0 ? "Despesas registradas neste mes" : "Nenhuma despesa lancada",
      icon: ArrowDownLeft,
      iconTone: "bg-red-100 text-red-600",
      title: "Despesas",
      value: toCurrency(monthlyExpense),
      valueTone: "text-red-600",
    },
    {
      detail: balance >= 0 ? "Resultado parcial do mes" : "Despesas acima das entradas",
      icon: Wallet,
      iconTone: balance >= 0 ? "bg-primary/10 text-primary" : "bg-red-100 text-red-600",
      title: "Saldo",
      value: toCurrency(balance),
      valueTone: balance >= 0 ? "text-foreground" : "text-red-600",
    },
    {
      detail: "Entradas somadas no ano",
      icon: Landmark,
      iconTone: "bg-amber-100 text-amber-600",
      title: "Acumulado anual",
      value: toCurrency(annualIncome),
      valueTone: "text-foreground",
    },
  ];

  const alertItems = [
    {
      detail: hasMovementsThisMonth
        ? balance >= 0
          ? "Entradas estao cobrindo as despesas registradas."
          : "Revise despesas antes de fechar o mes."
        : "Registre uma entrada ou despesa para comecar.",
      icon: hasMovementsThisMonth && balance >= 0 ? CheckCircle2 : AlertTriangle,
      tone: hasMovementsThisMonth && balance >= 0 ? "text-emerald-600" : "text-amber-600",
      title: hasMovementsThisMonth
        ? balance >= 0
          ? "Saldo positivo"
          : "Saldo negativo"
        : "Sem lancamentos",
    },
    {
      detail: `${limitUsagePercent.toFixed(1).replace(".", ",")}% do limite anual usado.`,
      icon: limitUsage >= 0.75 ? AlertTriangle : CheckCircle2,
      tone: limitUsage >= 1 ? "text-red-600" : limitUsage >= 0.75 ? "text-amber-600" : "text-emerald-600",
      title: limitStatus,
    },
    {
      detail: dasDone
        ? "Checklist do mes ja marcou o DAS como pago."
        : dasIsLate
          ? "Abra obrigacoes e atualize o checklist."
          : "Marque como pago quando concluir.",
      icon: dasDone ? CheckCircle2 : ReceiptText,
      tone: dasDone ? "text-emerald-600" : dasIsLate ? "text-red-600" : "text-muted-foreground",
      title: dasDone ? "DAS em dia" : dasIsLate ? "DAS em aberto" : "DAS no radar",
    },
  ];

  const NextActionIcon = nextAction.icon;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Dashboard</p>
          <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Ola, {getFirstName(profile)}
          </h1>
          <p className="max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground">
            Acompanhe seu mes, controle o limite do MEI e mantenha suas obrigacoes em dia.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button asChild className="w-full sm:w-auto" size="lg">
            <Link href="/app/movimentacoes">
              <Plus className="h-4 w-4" />
              Nova movimentacao
            </Link>
          </Button>
          <Button asChild className="w-full sm:w-auto" variant="outline" size="lg">
            <Link href="/app/fechamento-mensal">
              <CalendarClock className="h-4 w-4" />
              Ver fechamento
            </Link>
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card className="transition-shadow hover:shadow-card-hover" key={card.title}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
                    <p className={`break-words text-2xl font-semibold tracking-tight ${card.valueTone}`}>
                      {card.value}
                    </p>
                  </div>
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.iconTone}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{card.detail}</p>
              </CardContent>
            </Card>
          );
        })}
      </section>

      {/* Limit & Recent Movements */}
      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="overflow-hidden border-foreground/10 bg-foreground text-background shadow-elevated">
          <CardHeader className="p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-background">Limite do MEI</CardTitle>
                <CardDescription className="mt-1 text-background/60">
                  Acompanhamento anual do seu faturamento.
                </CardDescription>
              </div>
              <Badge variant={limitStatusVariant} className="w-fit">
                {limitStatus}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 p-5 pt-0 sm:p-6 sm:pt-0">
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="break-words text-3xl font-semibold tracking-tight sm:text-4xl">
                  {toCurrency(annualIncome)}
                </p>
                <p className="mt-2 text-sm text-background/60">faturamento acumulado registrado</p>
              </div>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-background/10">
                <CircleDollarSign className="h-6 w-6 text-primary" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="h-2.5 overflow-hidden rounded-full bg-background/15">
                <div
                  className={`h-full transition-all duration-500 ${limitBarTone}`}
                  style={{ width: `${limitUsagePercent}%` }}
                />
              </div>
              <div className="flex justify-between gap-3 text-xs text-background/60">
                <span>{limitUsagePercent.toFixed(1).replace(".", ",")}% usado</span>
                <span>{toCurrency(remainingLimit)} restante</span>
              </div>
            </div>

            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <div className="rounded-xl bg-background/10 p-3.5">
                <p className="font-semibold text-background">{toCurrency(remainingLimit)}</p>
                <p className="mt-1 text-xs text-background/60">disponivel</p>
              </div>
              <div className="rounded-xl bg-background/10 p-3.5">
                <p className="font-semibold text-background">{toCurrency(MEI_ANNUAL_LIMIT)}</p>
                <p className="mt-1 text-xs text-background/60">limite anual</p>
              </div>
              <div className="rounded-xl bg-background/10 p-3.5">
                <p className="font-semibold text-background">{checklistProgress} de {DASHBOARD_CHECKLIST_ITEMS}</p>
                <p className="mt-1 text-xs text-background/60">tarefas do mes</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Ultimas movimentacoes</CardTitle>
                <CardDescription>Registros mais recentes da sua conta.</CardDescription>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href="/app/movimentacoes">Ver tudo</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5 p-5 pt-0 sm:p-6 sm:pt-0">
            {recentMovements.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/30 p-5 text-center">
                <p className="font-medium text-foreground">Nenhuma movimentacao registrada.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Adicione uma entrada ou despesa para comecar.
                </p>
                <Button asChild className="mt-4" size="sm">
                  <Link href="/app/movimentacoes">
                    <Plus className="h-4 w-4" />
                    Adicionar agora
                  </Link>
                </Button>
              </div>
            ) : (
              recentMovements.map((movement) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3.5 transition-colors hover:bg-muted/30"
                  key={movement.id}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        movement.type === "entrada" ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"
                      }`}
                    >
                      {movement.type === "entrada" ? (
                        <ArrowUpRight className="h-4 w-4" />
                      ) : (
                        <ArrowDownLeft className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{movement.description}</p>
                      <p className="text-xs text-muted-foreground">{toDate(movement.occurred_on)}</p>
                    </div>
                  </div>
                  <p
                    className={`shrink-0 text-sm font-semibold ${
                      movement.type === "entrada" ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {toCurrency(movement.amount)}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      {/* Next Action & Alerts */}
      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-accent bg-accent/50">
          <CardHeader className="p-5 sm:p-6">
            <Badge variant="success" className="w-fit">
              {nextAction.label}
            </Badge>
            <CardTitle className="pt-2 text-foreground">{nextAction.title}</CardTitle>
            <CardDescription className="text-muted-foreground">{nextAction.description}</CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0 sm:p-6 sm:pt-0">
            <Button asChild className="w-full sm:w-auto gap-2">
              <Link href={nextAction.href}>
                <NextActionIcon className="h-4 w-4" />
                {nextAction.button}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-5 sm:p-6">
            <CardTitle>Alertas do mes</CardTitle>
            <CardDescription>O que merece atencao antes de fechar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 p-5 pt-0 sm:p-6 sm:pt-0">
            {alertItems.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  className="flex gap-3 rounded-xl border border-border/60 bg-card p-3.5"
                  key={item.title}
                >
                  <div className={`mt-0.5 ${item.tone}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{item.detail}</p>
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
