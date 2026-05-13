import { Suspense } from "react";
import { RouteTransitionPending } from "@/components/app/route-transition-pending";
import { ConfiguracoesForm } from "@/components/configuracoes/configuracoes-form";
import { getCurrentUserProfile } from "@/lib/profile";

export default function ConfiguracoesPage() {
  return (
    <Suspense fallback={<RouteTransitionPending label="Carregando configurações" />}>
      <ConfiguracoesData />
    </Suspense>
  );
}

async function ConfiguracoesData() {
  const { profile, profileError, user } = await getCurrentUserProfile();

  if (profileError) {
    throw new Error(`Não foi possível carregar suas configurações agora. Tente novamente em instantes. ${profileError.message}`);
  }

  return <ConfiguracoesForm contactEmail={user?.email ?? ""} profile={profile ?? null} />;
}
