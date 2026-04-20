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

  const [movementsResult, profileResult] = await Promise.all([
    supabase
      .from("movimentacoes")
      .select("id, type, description, amount, occurred_on, occurred_at, category")
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("initial_balance")
      .maybeSingle(),
  ]);

  if (movementsResult.error) {
    throw new Error(`Erro ao carregar movimentações: ${movementsResult.error.message}`);
  }

  if (profileResult.error) {
    throw new Error(`Erro ao carregar saldo inicial: ${profileResult.error.message}`);
  }

  return (
    <MovimentacoesManager
      initialBalance={Number(profileResult.data?.initial_balance ?? 0)}
      movements={movementsResult.data ?? []}
    />
  );
}
