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
      <div className="space-y-2">
        <Badge variant="success" className="w-fit">
          Obrigações
        </Badge>
        <h1 className="text-2xl font-semibold text-neutral-950 sm:text-3xl">Organização do MEI</h1>
        <p className="max-w-2xl text-sm leading-6 text-neutral-600">
          Um resumo simples das obrigações principais e o checklist do mês.
        </p>
      </div>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Status do mês</CardTitle>
              <CardDescription>Referente a {monthLabel}.</CardDescription>
            </div>
            <Badge variant={statusVariant} className="w-fit">
              {status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 pt-0 sm:grid-cols-3 sm:p-6 sm:pt-0">
          <div className="rounded-md border p-3">
            <p className="text-sm text-neutral-500">Checklist concluído</p>
            <p className="mt-2 text-sm font-medium text-neutral-950">
              {doneCount} de {total}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-sm text-neutral-500">Pendências</p>
            <p className="mt-2 text-sm font-medium text-neutral-950">{Math.max(total - doneCount, 0)}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-sm text-neutral-500">Referência</p>
            <p className="mt-2 text-sm font-medium text-neutral-950">{monthLabel}</p>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2">
        {obligations.map((item) => (
          <Card key={item.title}>
            <CardContent className="space-y-2 p-4">
              <p className="text-sm font-semibold text-neutral-950">{item.title}</p>
              <p className="text-sm text-neutral-500">{item.description}</p>
              <div className="flex flex-wrap gap-2 text-xs text-neutral-500">
                <span className="rounded-md border px-2 py-1">Frequência: {item.frequency}</span>
                <span className="rounded-md border px-2 py-1">Status: {item.status}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle>Checklist do mês</CardTitle>
          <CardDescription>Marque o que já foi feito para manter o mês em dia.</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <ObrigacoesChecklist items={checklist} monthKey={monthKey} />
        </CardContent>
      </Card>
    </div>
  );
}
