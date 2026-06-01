import { Suspense } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RouteTransitionPending } from "@/components/app/route-transition-pending";
import { ObrigacoesOverview } from "@/components/obrigacoes/obrigacoes-overview";
import { getOrCreateReminderPreferences } from "@/lib/obrigacoes/reminder-preferences";
import { getCurrentUserProfile } from "@/lib/profile";
import type { Database } from "@/types/database";

const checklistTemplate = [
  { key: "conferir-entradas", label: "Conferir entradas" },
  { key: "conferir-despesas", label: "Conferir despesas" },
  { key: "revisar-fechamento", label: "Fechamento mensal" },
  { key: "pagar-das", label: "DAS do mês" },
  { key: "entregar-dasn", label: "DASN-SIMEI anual" },
  { key: "guardar-comprovantes", label: "Comprovantes do mês" },
];

export default function ObrigacoesPage() {
  return (
    <Suspense fallback={<RouteTransitionPending label="Carregando obrigações" />}>
      <ObrigacoesData />
    </Suspense>
  );
}

async function ObrigacoesData() {
  const { profileError, supabase, user } = await getCurrentUserProfile();

  if (!user) {
    throw new Error("Faça login para carregar suas obrigações.");
  }

  if (profileError) {
    throw new Error(`Não foi possível carregar suas obrigações agora. Tente novamente em instantes. ${profileError.message}`);
  }

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(now);

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
  supabase: SupabaseClient<Database>,
  userId: string,
  monthKey: string,
) {
  const { data, error } = await supabase
    .from("obrigacoes_checklist")
    .select("item_key, done")
    .eq("user_id", userId)
    .eq("month", monthKey);

  if (error) {
    throw new Error(`Não foi possível carregar suas obrigações agora. Tente novamente em instantes. ${error.message}`);
  }

  return data ?? [];
}

async function getReminderPreferences(
  supabase: SupabaseClient<Database>,
  userId: string,
) {
  return getOrCreateReminderPreferences(supabase, userId);
}
