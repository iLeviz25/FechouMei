import { Suspense } from "react";
import { RouteTransitionPending } from "@/components/app/route-transition-pending";
import { ObrigacoesOverview } from "@/components/obrigacoes/obrigacoes-overview";
import { getOrCreateReminderPreferences } from "@/lib/obrigacoes/reminder-preferences";
import { createClient } from "@/lib/supabase/server";

const checklistTemplate = [
  { key: "conferir-entradas", label: "Conferir entradas do mês" },
  { key: "conferir-despesas", label: "Conferir despesas do mês" },
  { key: "revisar-fechamento", label: "Revisar o fechamento do mês" },
  { key: "pagar-das", label: "Pagar DAS mensal" },
  { key: "entregar-dasn", label: "Entregar DASN-SIMEI anual" },
  { key: "guardar-comprovantes", label: "Guardar comprovantes do mês" },
];

export default function ObrigacoesPage() {
  return (
    <Suspense fallback={<RouteTransitionPending label="Carregando obrigações do mês" />}>
      <ObrigacoesData />
    </Suspense>
  );
}

async function ObrigacoesData() {
  const supabase = await createClient();
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(now);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Faça login para carregar suas obrigações.");
  }

  const [checklistRows, reminderPreferences] = await Promise.all([
    getChecklistRows(supabase, user.id, monthKey),
    getReminderPreferences(supabase, user.id),
  ]);

  const checklist = checklistTemplate.map((item) => ({
    ...item,
    done: checklistRows.find((row) => row.item_key === item.key)?.done ?? false,
  }));

  return (
    <ObrigacoesOverview
      checklist={checklist}
      monthKey={monthKey}
      monthLabel={monthLabel}
      reminderPreferences={reminderPreferences}
    />
  );
}

async function getChecklistRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  monthKey: string,
) {
  const { data, error } = await supabase
    .from("obrigacoes_checklist")
    .select("item_key, done")
    .eq("user_id", userId)
    .eq("month", monthKey);

  if (error) {
    throw new Error(`Erro ao carregar checklist de obrigações: ${error.message}`);
  }

  return data ?? [];
}

async function getReminderPreferences(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  return getOrCreateReminderPreferences(supabase, userId);
}
