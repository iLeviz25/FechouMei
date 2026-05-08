import { ConfiguracoesForm } from "@/components/configuracoes/configuracoes-form";
import { getCurrentUserProfile } from "@/lib/profile";

export default async function ConfiguracoesPage() {
  const { profile, profileError, user } = await getCurrentUserProfile();

  if (profileError) {
    throw new Error(`Não foi possível carregar suas configurações agora. Tente novamente em instantes. ${profileError.message}`);
  }

  return <ConfiguracoesForm contactEmail={user?.email ?? ""} profile={profile ?? null} />;
}
