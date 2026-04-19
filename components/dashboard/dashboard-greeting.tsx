"use client";

import { useProfile } from "@/components/app/profile-provider";
import type { Profile } from "@/types/database";

function getFirstName(profile: Profile | null) {
  return profile?.full_name?.trim().split(/\s+/)[0] ?? "MEI";
}

export function DashboardGreeting() {
  const profile = useProfile();
  const firstName = getFirstName(profile);

  return (
    <h1 className="text-2xl font-semibold leading-tight tracking-tight text-neutral-950 sm:text-3xl">
      Olá, {firstName}. <span className="block sm:inline">Seu mês em resumo</span>
    </h1>
  );
}
