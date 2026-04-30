import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ReminderPreferences } from "@/types/database";

const REMINDER_PREFERENCES_SELECT =
  "user_id, das_monthly_enabled, dasn_annual_enabled, monthly_review_enabled, receipts_enabled, created_at, updated_at";

export const DEFAULT_REMINDER_PREFERENCE_VALUES = {
  das_monthly_enabled: true,
  dasn_annual_enabled: true,
  monthly_review_enabled: false,
  receipts_enabled: false,
} satisfies Pick<
  ReminderPreferences,
  "das_monthly_enabled" | "dasn_annual_enabled" | "monthly_review_enabled" | "receipts_enabled"
>;

export function createDefaultReminderPreferences(userId: string): ReminderPreferences {
  const timestamp = new Date().toISOString();

  return {
    ...DEFAULT_REMINDER_PREFERENCE_VALUES,
    created_at: timestamp,
    updated_at: timestamp,
    user_id: userId,
  };
}

export async function getOrCreateReminderPreferences(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ReminderPreferences> {
  const existingPreferences = await fetchReminderPreferences(supabase, userId);

  if (existingPreferences) {
    return existingPreferences;
  }

  const { data, error } = await supabase
    .from("reminder_preferences")
    .insert(createDefaultReminderPreferences(userId))
    .select(REMINDER_PREFERENCES_SELECT)
    .single();

  if (!error && data) {
    return data;
  }

  if (error?.code === "23505") {
    const currentPreferences = await fetchReminderPreferences(supabase, userId);

    if (currentPreferences) {
      return currentPreferences;
    }
  }

  throw new Error(`Erro ao inicializar lembretes de obrigacoes: ${error?.message ?? "registro nao retornado"}`);
}

async function fetchReminderPreferences(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ReminderPreferences | null> {
  const { data, error } = await supabase
    .from("reminder_preferences")
    .select(REMINDER_PREFERENCES_SELECT)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao carregar lembretes de obrigacoes: ${error.message}`);
  }

  return data;
}
