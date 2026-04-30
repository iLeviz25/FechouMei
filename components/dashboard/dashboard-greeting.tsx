"use client";

import { useProfile } from "@/components/app/profile-provider";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types/database";

type DashboardGreetingProps = {
  className?: string;
};

function getFirstName(profile: Profile | null) {
  return profile?.full_name?.trim().split(/\s+/)[0] ?? "MEI";
}

export function DashboardGreeting({ className }: DashboardGreetingProps) {
  const profile = useProfile();
  const firstName = getFirstName(profile);

  return (
    <h1
      className={cn(
        "text-balance text-[1.85rem] font-extrabold leading-[1.02] tracking-[-0.04em] text-neutral-950 min-[400px]:text-[2rem] sm:text-[2.5rem]",
        className,
      )}
    >
      Ola, {firstName}
    </h1>
  );
}
