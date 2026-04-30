"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Profile } from "@/types/database";

const ProfileContext = createContext<Profile | null>(null);

export function ProfileProvider({
  children,
  profile,
}: {
  children: ReactNode;
  profile: Profile | null;
}) {
  return <ProfileContext.Provider value={profile}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  return useContext(ProfileContext);
}
