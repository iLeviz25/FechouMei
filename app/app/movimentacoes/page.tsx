import { Suspense } from "react";
import { RouteTransitionPending } from "@/components/app/route-transition-pending";
import { MovimentacoesManager } from "@/components/movimentacoes/movimentacoes-manager";
import { getCurrentUserProfile } from "@/lib/profile";

export default function MovimentacoesPage() {
  return (
    <Suspense fallback={<RouteTransitionPending label="Carregando movimentações" />}>
      <MovimentacoesData />
    </Suspense>
  );
}

async function MovimentacoesData() {
  const { profile, profileError, supabase, user } = await getCurrentUserProfile();

  if (!user) {
    throw new Error("Faça login para ver suas movimentações.");
  }

  const movementsResult = await supabase
    .from("movimentacoes")
    .select("id, type, description, amount, occurred_on, occurred_at, category")
    .eq("user_id", user.id)
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (movementsResult.error) {
    throw new Error(`Não foi possível carregar suas movimentações: ${movementsResult.error.message}`);
  }

  if (profileError) {
    throw new Error(`Não foi possível carregar seu saldo atual. Tente novamente em instantes. ${profileError.message}`);
  }

  return (
    <MovimentacoesManager
      initialBalance={Number(profile?.initial_balance ?? 0)}
      movements={movementsResult.data ?? []}
    />
  );
}
