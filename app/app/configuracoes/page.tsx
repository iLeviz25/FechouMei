import { Suspense } from "react";
import { RouteTransitionPending } from "@/components/app/route-transition-pending";
import { ConfiguracoesForm } from "@/components/configuracoes/configuracoes-form";
import { getCurrentUserProfile } from "@/lib/profile";
import type { BillingCycleCode } from "@/lib/billing/plans";

export default function ConfiguracoesPage() {
  return (
    <Suspense fallback={<RouteTransitionPending label="Carregando configurações" />}>
      <ConfiguracoesData />
    </Suspense>
  );
}

async function ConfiguracoesData() {
  const { profile, profileError, supabase, user } = await getCurrentUserProfile();

  if (profileError) {
    throw new Error(`Não foi possível carregar suas configurações agora. Tente novamente em instantes. ${profileError.message}`);
  }

  const currentBillingCycle = user ? await getCurrentBillingCycle(user.id, supabase) : null;

  return <ConfiguracoesForm billingCycle={currentBillingCycle} contactEmail={user?.email ?? ""} profile={profile ?? null} />;
}

async function getCurrentBillingCycle(
  userId: string,
  supabase: Awaited<ReturnType<typeof getCurrentUserProfile>>["supabase"],
): Promise<BillingCycleCode | null> {
  const { data, error } = await supabase
    .from("cakto_orders")
    .select("billing_cycle")
    .eq("user_id", userId)
    .in("status", ["paid", "approved", "authorized", "completed", "complete"])
    .order("paid_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[configuracoes] Failed to load current billing cycle.", {
      error: error.message,
      userId,
    });
    return null;
  }

  return data?.billing_cycle ?? null;
}
