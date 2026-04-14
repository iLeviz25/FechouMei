import { redirect } from "next/navigation";
import { ConfiguracoesForm } from "@/components/configuracoes/configuracoes-form";
import { getCurrentUserProfile } from "@/lib/profile";

export default async function ConfiguracoesPage() {
  const { profile, profileError, user } = await getCurrentUserProfile();

  if (!user) {
    redirect("/login");
  }

  if (profileError) {
    throw new Error(`Erro ao carregar configurações: ${profileError.message}`);
  }

  return <ConfiguracoesForm profile={profile ?? null} />;
}
