import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordRecoveryForm } from "@/components/auth/password-recovery-form";

export default function RecuperarSenhaPage() {
  return (
    <AuthShell
      description="Informe o e-mail da sua conta para receber um link seguro de redefinição."
      switchHref="/login"
      switchLabel="voltar ao login"
      switchText="Lembrou sua senha?"
      title="Recuperar senha"
    >
      <PasswordRecoveryForm />
    </AuthShell>
  );
}
