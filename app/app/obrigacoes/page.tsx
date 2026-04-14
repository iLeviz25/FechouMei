import { ObrigacoesOverview } from "@/components/obrigacoes/obrigacoes-overview";
import { createClient } from "@/lib/supabase/server";

const checklistTemplate = [
  { key: "conferir-entradas", label: "Conferir entradas do mês" },
  { key: "conferir-despesas", label: "Conferir despesas do mês" },
  { key: "revisar-fechamento", label: "Revisar fechamento mensal" },
  { key: "pagar-das", label: "Pagar DAS" },
  { key: "entregar-dasn", label: "Entregar DASN-SIMEI" },
  { key: "guardar-comprovantes", label: "Guardar comprovantes" },
];

export default async function ObrigacoesPage() {
  const supabase = await createClient();
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(now);

  const { data: checklistRows, error } = await supabase
    .from("obrigacoes_checklist")
    .select("item_key, done")
    .eq("month", monthKey);

  if (error) {
    throw new Error(`Erro ao carregar checklist de obrigações: ${error.message}`);
  }

  const checklist = checklistTemplate.map((item) => ({
    ...item,
    done: checklistRows?.find((row) => row.item_key === item.key)?.done ?? false,
  }));

  return <ObrigacoesOverview checklist={checklist} monthKey={monthKey} monthLabel={monthLabel} />;
}
