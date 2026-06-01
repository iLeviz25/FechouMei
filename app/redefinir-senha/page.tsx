import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

type RedefinirSenhaPageProps = {
  searchParams?: Promise<{
    mode?: string;
    next?: string;
  }>;
};

function getSafeNextPath(nextPath: string | null | undefined) {
  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return "/onboarding";
  }

  return nextPath;
}

export default async function RedefinirSenhaPage({ searchParams }: RedefinirSenhaPageProps) {
  const params = await searchParams;
  const isInviteMode = params?.mode === "invite";
  const nextPath = getSafeNextPath(params?.next);

  return (
    <AuthShell
      description={
        isInviteMode
          ? "Crie sua senha para começar a usar o FechouMEI com o acesso que acabou de ser liberado."
          : "Crie uma nova senha para voltar a acessar o FechouMEI."
      }
      switchHref="/login"
      switchLabel="ir para o login"
      switchText={isInviteMode ? "Já criou sua senha?" : "Já redefiniu?"}
      title={isInviteMode ? "Criar senha de acesso" : "Redefinir senha"}
    >
      <ResetPasswordForm mode={isInviteMode ? "invite" : "recovery"} nextPath={nextPath} />
    </AuthShell>
  );
}
