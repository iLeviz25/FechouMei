"use server";

import { createClient } from "@/lib/supabase/server";

export type CompleteOnboardingTourResult =
  | {
      completedAt: string;
      ok: true;
    }
  | {
      message: string;
      ok: false;
    };

export async function completeOnboardingTour(): Promise<CompleteOnboardingTourResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      message: "Nao foi possivel confirmar sua sessao. Entre novamente para salvar o guia.",
      ok: false,
    };
  }

  const completedAt = new Date().toISOString();
  const { error } = await supabase
    .from("profiles")
    .update({ onboarding_tour_completed_at: completedAt })
    .eq("id", user.id);

  if (error) {
    console.error("[onboarding-tour] Falha ao salvar conclusao do tour", error);
    return {
      message: "Nao foi possivel salvar agora. Tente concluir ou pular novamente.",
      ok: false,
    };
  }

  return { completedAt, ok: true };
}
