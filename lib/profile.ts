import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getCurrentUserProfile = cache(async () => {
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
});
