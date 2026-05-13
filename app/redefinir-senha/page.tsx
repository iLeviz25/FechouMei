import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default function RedefinirSenhaPage() {
  return (
    <AuthShell
      description="Crie uma nova senha para voltar a acessar o FechouMEI."
      switchHref="/login"
      switchLabel="ir para o login"
      switchText="Já redefiniu?"
      title="Redefinir senha"
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}
