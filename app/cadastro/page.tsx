import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";
import { getCurrentUserProfile } from "@/lib/profile";

export default async function CadastroPage() {
  const { profile, profileError, user } = await getCurrentUserProfile();

  if (user) {
    if (profileError) {
      throw new Error(`Erro ao carregar perfil: ${profileError.message}`);
    }

    redirect(profile?.onboarding_completed ? "/app/dashboard" : "/onboarding");
  }

  return (
    <AuthShell
      description="Crie seu acesso para organizar a rotina financeira do seu MEI."
      switchHref="/login"
      switchLabel="entre aqui"
      switchText="Já tem conta?"
      title="Criar conta"
    >
      <SignupForm />
    </AuthShell>
  );
}
