import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function getCurrentUserProfile() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      profile: null,
      profileError: null,
      supabase,
      user: null,
      userError,
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return {
    profile: profile ?? null,
    profileError,
    supabase,
    user,
    userError: null,
  };
}

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
