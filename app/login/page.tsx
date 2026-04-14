import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUserProfile } from "@/lib/profile";

type LoginPageProps = {
  searchParams?: Promise<{
    redirectedFrom?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { profile, profileError, user } = await getCurrentUserProfile();
  const params = await searchParams;

  if (user) {
    if (profileError) {
      throw new Error(`Erro ao carregar perfil: ${profileError.message}`);
    }

    redirect(profile?.onboarding_completed ? "/app/dashboard" : "/onboarding");
  }

  return (
    <AuthShell
      description="Entre para continuar seu fechamento mensal."
      switchHref="/cadastro"
      switchLabel="crie sua conta"
      switchText="Ainda não tem conta?"
      title="Entrar no FechouMEI"
    >
      <LoginForm redirectedFrom={params?.redirectedFrom} />
    </AuthShell>
  );
}
