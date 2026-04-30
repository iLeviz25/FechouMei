"use server";
import { createClient } from "@/lib/supabase/server";

export type ChecklistActionResult = {
  ok: boolean;
  message: string;
};

export type ReminderPreferencesInput = {
  das_monthly_enabled: boolean;
  dasn_annual_enabled: boolean;
  monthly_review_enabled: boolean;
  receipts_enabled: boolean;
};

async function getUserId() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Faça login para continuar.");
  }

  return { supabase, userId: user.id };
}

export async function toggleChecklistItem({
  itemKey,
  done,
  monthKey,
}: {
  itemKey: string;
  done: boolean;
  monthKey: string;
}): Promise<ChecklistActionResult> {
  try {
    if (!/^\d{4}-\d{2}$/.test(monthKey)) {
      throw new Error("Mês inválido.");
    }

    if (!itemKey) {
      throw new Error("Item inválido.");
    }

    const { supabase, userId } = await getUserId();
    const { error } = await supabase.from("obrigacoes_checklist").upsert(
      {
        user_id: userId,
        month: monthKey,
        item_key: itemKey,
        done,
      },
      { onConflict: "user_id,month,item_key" },
    );

    if (error) {
      throw new Error(error.message);
    }

    return { ok: true, message: "Checklist atualizado." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Não foi possível atualizar o checklist.",
    };
  }
}

export async function updateReminderPreferences(
  preferences: ReminderPreferencesInput,
): Promise<ChecklistActionResult> {
  try {
    const { supabase, userId } = await getUserId();
    const { error } = await supabase.from("reminder_preferences").upsert(
      {
        user_id: userId,
        das_monthly_enabled: Boolean(preferences.das_monthly_enabled),
        dasn_annual_enabled: Boolean(preferences.dasn_annual_enabled),
        monthly_review_enabled: Boolean(preferences.monthly_review_enabled),
        receipts_enabled: Boolean(preferences.receipts_enabled),
      },
      { onConflict: "user_id" },
    );

    if (error) {
      throw new Error(error.message);
    }

    return { ok: true, message: "Preferências salvas no app." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Não foi possível salvar os lembretes.",
    };
  }
}
