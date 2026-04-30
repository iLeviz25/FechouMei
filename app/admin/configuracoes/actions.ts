"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { updateAdminSetting, type AdminSettingKey, type AdminSettingValue } from "@/lib/admin/settings";

function checked(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function parseDailyLimit(formData: FormData): number | null {
  const raw = text(formData, "max_agent_messages_per_day");

  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100000) {
    throw new Error("O limite diario precisa ser um numero inteiro entre 0 e 100000.");
  }

  return parsed;
}

export async function saveAdminSettingsAction(formData: FormData) {
  let updates: Array<[AdminSettingKey, AdminSettingValue]>;

  try {
    const publicSupportMessage = text(formData, "public_support_message");

    if (publicSupportMessage.length > 500) {
      throw new Error("A mensagem publica deve ter no maximo 500 caracteres.");
    }

    updates = [
      ["helena_enabled", checked(formData, "helena_enabled")],
      ["whatsapp_enabled", checked(formData, "whatsapp_enabled")],
      ["maintenance_mode", checked(formData, "maintenance_mode")],
      ["support_email", text(formData, "support_email")],
      ["public_support_message", publicSupportMessage],
      ["max_agent_messages_per_day", parseDailyLimit(formData)],
    ];
  } catch (error) {
    const message = error instanceof Error ? error.message : "Configuracao invalida.";
    redirect(`/admin/configuracoes?error=${encodeURIComponent(message)}`);
  }

  for (const [key, value] of updates) {
    const result = await updateAdminSetting(key, value);

    if (!result.ok) {
      redirect(`/admin/configuracoes?error=${encodeURIComponent(result.error ?? "Falha ao salvar configuracoes.")}`);
    }
  }

  revalidatePath("/admin/configuracoes");
  revalidatePath("/admin/logs");
  redirect("/admin/configuracoes?saved=1");
}
