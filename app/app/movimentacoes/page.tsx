import { Suspense } from "react";
import { RouteTransitionPending } from "@/components/app/route-transition-pending";
import { MovimentacoesManager } from "@/components/movimentacoes/movimentacoes-manager";
import { getCurrentUserProfile } from "@/lib/profile";

export default function MovimentacoesPage() {
  return (
    <Suspense fallback={<RouteTransitionPending label="Carregando entradas e despesas" />}>
      <MovimentacoesData />
    </Suspense>
  );
}

async function MovimentacoesData() {
  const { profile, profileError, supabase } = await getCurrentUserProfile();

  const movementsResult = await supabase
    .from("movimentacoes")
    .select("id, type, description, amount, occurred_on, occurred_at, category")
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (movementsResult.error) {
    throw new Error(`Erro ao carregar movimentações: ${movementsResult.error.message}`);
  }

  if (profileError) {
    throw new Error(`Erro ao carregar ajuste de saldo: ${profileError.message}`);
  }

  return (
    <MovimentacoesManager
      initialBalance={Number(profile?.initial_balance ?? 0)}
      movements={movementsResult.data ?? []}
    />
  );
}
