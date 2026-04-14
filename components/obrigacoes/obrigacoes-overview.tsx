import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ObrigacoesChecklist } from "@/components/obrigacoes/obrigacoes-checklist";

type ChecklistItem = {
  key: string;
  label: string;
  done: boolean;
};

type ObrigacoesOverviewProps = {
  checklist: ChecklistItem[];
  monthKey: string;
  monthLabel: string;
};

const DAS_DUE_DAY = 20;
const DASN_START_MONTH = 1;
const DASN_END_MONTH = 5;

type ObligationStatus = "Pago" | "Em aberto" | "Atrasado" | "Planejar" | "Em prazo" | "Entregue";

export function ObrigacoesOverview({ checklist, monthKey, monthLabel }: ObrigacoesOverviewProps) {
  const total = checklist.length;
  const doneCount = checklist.filter((item) => item.done).length;
  const status =
    doneCount === 0 ? "Mês em aberto" : doneCount === total ? "Obrigações em dia" : "Pendente de revisão";
  const statusVariant = doneCount === total ? "success" : "secondary";
  const today = new Date();
  const dasDone = checklist.find((item) => item.key === "pagar-das")?.done ?? false;
  const dasDueDate = new Date(today.getFullYear(), today.getMonth(), DAS_DUE_DAY);
  const dasStatus: ObligationStatus = dasDone ? "Pago" : today > dasDueDate ? "Atrasado" : "Em aberto";
  const dasnDone = checklist.find((item) => item.key === "entregar-dasn")?.done ?? false;
  const inDasnPeriod = today.getMonth() + 1 >= DASN_START_MONTH && today.getMonth() + 1 <= DASN_END_MONTH;
  const dasnStatus: ObligationStatus = dasnDone
    ? "Entregue"
    : inDasnPeriod
      ? "Em prazo"
      : "Planejar";
  const obligations = [
    {
      title: "DAS mensal",
      description: "Guia de pagamento mensal do MEI.",
      frequency: "Mensal",
      status: dasStatus,
    },
    {
      title: "Declaração anual (DASN-SIMEI)",
      description: "Declaração anual obrigatória do MEI.",
      frequency: "Anual",
      status: dasnStatus,
    },
  ];

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Obrigacoes</p>
        <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Organizacao do MEI
        </h1>
        <p className="max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground">
          Um resumo simples das obrigacoes principais e o checklist do mes.
        </p>
      </div>

      {/* Status Card */}
      <Card>
        <CardHeader className="p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Status do mes</CardTitle>
              <CardDescription>Referente a {monthLabel}.</CardDescription>
            </div>
            <Badge variant={statusVariant} className="w-fit">
              {status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 p-5 pt-0 sm:grid-cols-3 sm:p-6 sm:pt-0">
          <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
            <p className="text-sm font-medium text-muted-foreground">Checklist concluido</p>
            <p className="mt-2 text-lg font-semibold text-foreground">
              {doneCount} de {total}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
            <p className="text-sm font-medium text-muted-foreground">Pendencias</p>
            <p className="mt-2 text-lg font-semibold text-foreground">{Math.max(total - doneCount, 0)}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
            <p className="text-sm font-medium text-muted-foreground">Referencia</p>
            <p className="mt-2 text-lg font-semibold text-foreground">{monthLabel}</p>
          </div>
        </CardContent>
      </Card>

      {/* Obligations Cards */}
      <section className="grid gap-3 sm:grid-cols-2">
        {obligations.map((item) => (
          <Card key={item.title} className="transition-shadow hover:shadow-card-hover">
            <CardContent className="p-5">
              <p className="font-semibold text-foreground">{item.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="muted">{item.frequency}</Badge>
                <Badge
                  variant={
                    item.status === "Pago" || item.status === "Entregue"
                      ? "success"
                      : item.status === "Atrasado"
                        ? "danger"
                        : "secondary"
                  }
                >
                  {item.status}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Checklist Card */}
      <Card>
        <CardHeader className="p-5 sm:p-6">
          <CardTitle>Checklist do mes</CardTitle>
          <CardDescription>Marque o que ja foi feito para manter o mes em dia.</CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-0 sm:p-6 sm:pt-0">
          <ObrigacoesChecklist items={checklist} monthKey={monthKey} />
        </CardContent>
      </Card>
    </div>
  );
}
