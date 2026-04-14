import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Erro ao carregar perfil: ${profileError.message}`);
  }

  if (profile?.onboarding_completed) {
    redirect("/app/dashboard");
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-neutral-50 px-4 py-6 sm:px-10 sm:py-10">
      <div className="mx-auto max-w-5xl space-y-6 sm:space-y-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <Badge variant="success" className="w-fit">
              Primeiro acesso
            </Badge>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-neutral-950 sm:text-4xl">
                Vamos deixar seu painel com a sua cara.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-neutral-600">
                Preencha o básico para o FechouMEI organizar a experiência inicial do seu
                fechamento mensal.
              </p>
            </div>
          </div>
          <div className="w-fit rounded-lg border bg-white px-4 py-3 text-sm text-neutral-600 shadow-sm">
            Leva menos de 1 minuto
          </div>
        </div>

        <OnboardingForm profile={profile} />
      </div>
    </main>
  );
}
