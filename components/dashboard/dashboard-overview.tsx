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
      bar: "bg-emerald-600",
      detail: monthlyIncome > 0 ? "Receitas registradas neste mês" : "Nenhuma entrada lançada",
      icon: ArrowUpRight,
      iconTone: "bg-emerald-100 text-emerald-700",
      surface: "border-emerald-100 bg-emerald-50/70",
      title: "Entradas",
      value: toCurrency(monthlyIncome),
      valueTone: "text-emerald-800",
    },
    {
      bar: "bg-red-500",
      detail: monthlyExpense > 0 ? "Despesas registradas neste mês" : "Nenhuma despesa lançada",
      icon: ArrowDownLeft,
      iconTone: "bg-red-100 text-red-700",
      surface: "border-red-100 bg-red-50/70",
      title: "Despesas",
      value: toCurrency(monthlyExpense),
      valueTone: "text-red-700",
    },
    {
      bar: balance >= 0 ? "bg-neutral-800" : "bg-red-500",
      detail: balance >= 0 ? "Resultado parcial do mês" : "Despesas acima das entradas",
      icon: Wallet,
      iconTone: balance >= 0 ? "bg-neutral-100 text-neutral-800" : "bg-red-100 text-red-700",
      surface: balance >= 0 ? "border-neutral-200 bg-white" : "border-red-100 bg-red-50/60",
      title: "Saldo",
      value: toCurrency(balance),
      valueTone: balance >= 0 ? "text-neutral-950" : "text-red-700",
    },
    {
      bar: "bg-amber-500",
      detail: "Entradas somadas no ano",
      icon: Landmark,
      iconTone: "bg-amber-100 text-amber-700",
      surface: "border-amber-100 bg-amber-50/60",
      title: "Acumulado anual",
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
        : "Registre uma entrada ou despesa para começar.",
      icon: hasMovementsThisMonth && balance >= 0 ? CheckCircle2 : AlertTriangle,
      tone: hasMovementsThisMonth && balance >= 0 ? "text-emerald-700" : "text-amber-700",
      title: hasMovementsThisMonth
        ? balance >= 0
          ? "Saldo positivo"
          : "Saldo negativo"
        : "Sem lançamentos",
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

  const NextActionIcon = nextAction.icon;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-3">
          <Badge variant="success" className="w-fit">
            Dashboard
          </Badge>
          <div>
            <h1 className="text-2xl font-semibold leading-tight text-neutral-950 sm:text-3xl">
              Olá, {getFirstName(profile)}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
              Um resumo direto para acompanhar o mês, evitar surpresa no limite e manter o fechamento em dia.
            </p>
          </div>
        </div>

        <div className="grid gap-2 sm:flex sm:items-center">
          <Button asChild className="w-full sm:w-auto">
            <Link href="/app/movimentacoes">
              <Plus className="h-4 w-4" />
              Adicionar movimentação
            </Link>
          </Button>
          <Button asChild className="w-full sm:w-auto" variant="outline">
            <Link href="/app/fechamento-mensal">
              <CalendarClock className="h-4 w-4" />
              Fechar mês
            </Link>
          </Button>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card className={`overflow-hidden ${card.surface}`} key={card.title}>
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase text-neutral-500">{card.title}</p>
                    <p className={`mt-2 break-words text-2xl font-semibold leading-tight ${card.valueTone}`}>
                      {card.value}
                    </p>
                  </div>
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${card.iconTone}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
                <p className="mt-3 text-sm leading-5 text-neutral-600">{card.detail}</p>
                <div className={`mt-4 h-1 rounded-full ${card.bar}`} />
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="overflow-hidden border-neutral-900 bg-neutral-950 text-white shadow-[0_18px_45px_rgba(15,23,42,0.18)]">
          <CardHeader className="p-4 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-white">Limite do MEI</CardTitle>
                <CardDescription className="mt-2 text-neutral-300">
                  Acompanhamento anual com as entradas registradas.
                </CardDescription>
              </div>
              <Badge variant={limitStatusVariant} className="w-fit">
                {limitStatus}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 p-4 pt-0 sm:p-6 sm:pt-0">
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="break-words text-3xl font-semibold leading-tight sm:text-4xl">
                  {toCurrency(annualIncome)}
                </p>
                <p className="mt-2 text-sm text-neutral-300">faturamento acumulado registrado</p>
              </div>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-white/10 text-emerald-200">
                <CircleDollarSign className="h-6 w-6" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="h-3 overflow-hidden rounded-md bg-white/15">
                <div className={`h-full ${limitBarTone}`} style={{ width: `${limitUsagePercent}%` }} />
              </div>
              <div className="flex justify-between gap-3 text-xs text-neutral-300">
                <span>{limitUsagePercent.toFixed(1).replace(".", ",")}% usado</span>
                <span>{toCurrency(remainingLimit)} restante</span>
              </div>
            </div>

            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <div className="rounded-md border border-white/10 bg-white/10 p-3">
                <p className="font-semibold text-white">{toCurrency(remainingLimit)}</p>
                <p className="mt-1 text-neutral-300">restante</p>
              </div>
              <div className="rounded-md border border-white/10 bg-white/10 p-3">
                <p className="font-semibold text-white">{toCurrency(MEI_ANNUAL_LIMIT)}</p>
                <p className="mt-1 text-neutral-300">limite anual</p>
              </div>
              <div className="rounded-md border border-white/10 bg-white/10 p-3">
                <p className="font-semibold text-white">{checklistProgress} de {DASHBOARD_CHECKLIST_ITEMS}</p>
                <p className="mt-1 text-neutral-300">tarefas do mês</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Últimas movimentações</CardTitle>
                <CardDescription>Registros mais recentes da sua conta.</CardDescription>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href="/app/movimentacoes">Ver tudo</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
            {recentMovements.length === 0 ? (
              <div className="rounded-md border border-dashed bg-neutral-50 p-4">
                <p className="text-sm font-medium text-neutral-950">Nenhuma movimentação registrada ainda.</p>
                <p className="mt-1 text-sm leading-6 text-neutral-600">
                  Adicione uma entrada ou despesa para o dashboard começar a trabalhar por você.
                </p>
                <Button asChild className="mt-4 w-full" size="sm">
                  <Link href="/app/movimentacoes">
                    <Plus className="h-4 w-4" />
                    Adicionar agora
                  </Link>
                </Button>
              </div>
            ) : (
              recentMovements.map((movement) => (
                <div className="rounded-md border bg-white p-3 shadow-sm" key={movement.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-neutral-950">{movement.description}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {movement.type === "entrada" ? "Entrada" : "Despesa"} · {toDate(movement.occurred_on)}
                      </p>
                    </div>
                    <p
                      className={
                        movement.type === "entrada"
                          ? "shrink-0 text-sm font-semibold text-emerald-700"
                          : "shrink-0 text-sm font-semibold text-red-600"
                      }
                    >
                      {toCurrency(movement.amount)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-emerald-100 bg-emerald-50/70">
          <CardHeader className="p-4 sm:p-6">
            <Badge variant="success" className="w-fit">
              {nextAction.label}
            </Badge>
            <CardTitle className="pt-2">{nextAction.title}</CardTitle>
            <CardDescription>{nextAction.description}</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <Button asChild className="w-full sm:w-auto">
              <Link href={nextAction.href}>
                <NextActionIcon className="h-4 w-4" />
                {nextAction.button}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle>Alertas do mês</CardTitle>
            <CardDescription>O que merece atenção antes de fechar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
            {alertItems.map((item) => {
              const Icon = item.icon;
              return (
                <div className="flex gap-3 rounded-md border bg-white p-3 shadow-sm" key={item.title}>
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${item.tone}`} />
                  <div>
                    <p className="text-sm font-medium text-neutral-950">{item.title}</p>
                    <p className="mt-1 text-sm leading-5 text-neutral-600">{item.detail}</p>
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
