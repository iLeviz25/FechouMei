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
      message: "Não conseguimos salvar seu guia. Entre novamente e tente outra vez.",
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
      message: "Não conseguimos salvar agora. Tente de novo em instantes.",
      ok: false,
    };
  }

  return { completedAt, ok: true };
}
