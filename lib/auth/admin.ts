import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/profile";

export { getCurrentUserProfile };

export async function isCurrentUserAdmin() {
  const { profile, profileError, user } = await getCurrentUserProfile();

  if (!user || profileError) {
    return false;
  }

  return profile?.role === "admin";
}

export async function requireAdmin() {
  const authState = await getCurrentUserProfile();

  if (!authState.user) {
    redirect("/login");
  }

  if (authState.profileError || authState.profile?.role !== "admin") {
    redirect("/app/dashboard");
  }

  return authState;
}
