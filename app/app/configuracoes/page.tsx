"use client";

import { useProfile } from "@/components/app/profile-provider";
import { ConfiguracoesForm } from "@/components/configuracoes/configuracoes-form";

export default function ConfiguracoesPage() {
  const profile = useProfile();

  return <ConfiguracoesForm profile={profile ?? null} />;
}
