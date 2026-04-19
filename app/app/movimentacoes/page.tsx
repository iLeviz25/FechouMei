import { Suspense } from "react";
import { RouteTransitionPending } from "@/components/app/route-transition-pending";
import { MovimentacoesManager } from "@/components/movimentacoes/movimentacoes-manager";
import { createClient } from "@/lib/supabase/server";

export default function MovimentacoesPage() {
  return (
    <Suspense fallback={<RouteTransitionPending label="Carregando entradas e despesas" />}>
      <MovimentacoesData />
    </Suspense>
  );
}

async function MovimentacoesData() {
  const supabase = await createClient();

  const { data: movements, error } = await supabase
    .from("movimentacoes")
    .select("id, type, description, amount, occurred_on, category")
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Erro ao carregar movimentações: ${error.message}`);
  }

  return <MovimentacoesManager movements={movements ?? []} />;
}
