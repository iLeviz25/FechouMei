import type { Json } from "@/types/database";
import { createClient } from "@/lib/supabase/server";

export type AdminSettingKey =
  | "helena_enabled"
  | "whatsapp_enabled"
  | "maintenance_mode"
  | "support_email"
  | "public_support_message"
  | "max_agent_messages_per_day";

export type AdminSettingValue = boolean | string | number | null;

export type AdminSetting = {
  key: AdminSettingKey;
  value: AdminSettingValue;
  description: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type AdminSettingsResult = {
  available: boolean;
  error: string | null;
  settings: Record<AdminSettingKey, AdminSetting>;
};

const defaults: Record<AdminSettingKey, AdminSetting> = {
  helena_enabled: {
    description: "Ativo no sistema: controla o uso da Helena no app e no WhatsApp.",
    key: "helena_enabled",
    updatedAt: null,
    updatedBy: null,
    value: true,
  },
  maintenance_mode: {
    description: "Ativo no sistema: bloqueia temporariamente a Helena para usuarios finais.",
    key: "maintenance_mode",
    updatedAt: null,
    updatedBy: null,
    value: false,
  },
  max_agent_messages_per_day: {
    description: "Ativo no sistema: limite diario de mensagens da Helena por usuario; vazio ou 0 significa sem limite.",
    key: "max_agent_messages_per_day",
    updatedAt: null,
    updatedBy: null,
    value: null,
  },
  public_support_message: {
    description: "Informativo/futuro: mensagem publica salva para uso posterior.",
    key: "public_support_message",
    updatedAt: null,
    updatedBy: null,
    value: "Suporte FechouMEI em operacao normal.",
  },
  support_email: {
    description: "Informativo/futuro: e-mail de suporte salvo para uso operacional posterior.",
    key: "support_email",
    updatedAt: null,
    updatedBy: null,
    value: "",
  },
  whatsapp_enabled: {
    description: "Ativo no sistema: controla apenas o canal WhatsApp da Helena.",
    key: "whatsapp_enabled",
    updatedAt: null,
    updatedBy: null,
    value: true,
  },
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isSettingKey(value: unknown): value is AdminSettingKey {
  return (
    value === "helena_enabled" ||
    value === "whatsapp_enabled" ||
    value === "maintenance_mode" ||
    value === "support_email" ||
    value === "public_support_message" ||
    value === "max_agent_messages_per_day"
  );
}

function parseValue(value: unknown): AdminSettingValue {
  if (typeof value === "boolean" || typeof value === "string" || value === null) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return null;
}

function cloneDefaults() {
  return {
    helena_enabled: { ...defaults.helena_enabled },
    maintenance_mode: { ...defaults.maintenance_mode },
    max_agent_messages_per_day: { ...defaults.max_agent_messages_per_day },
    public_support_message: { ...defaults.public_support_message },
    support_email: { ...defaults.support_email },
    whatsapp_enabled: { ...defaults.whatsapp_enabled },
  };
}

export async function getAdminSettings(): Promise<AdminSettingsResult> {
  const settings = cloneDefaults();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_admin_settings");

  if (error) {
    console.error("[admin-settings] Failed to load settings", error);
    return {
      available: false,
      error: error.message,
      settings,
    };
  }

  if (!Array.isArray(data)) {
    return {
      available: false,
      error: "Configuracoes admin indisponiveis.",
      settings,
    };
  }

  for (const item of data) {
    const record = asRecord(item);
    const key = record.key;

    if (!isSettingKey(key)) {
      continue;
    }

    settings[key] = {
      key,
      value: parseValue(record.value),
      description: asString(record.description),
      updatedAt: asString(record.updatedAt),
      updatedBy: asString(record.updatedBy),
    };
  }

  return {
    available: true,
    error: null,
    settings,
  };
}

export async function updateAdminSetting(key: AdminSettingKey, value: AdminSettingValue) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_admin_setting", {
    setting_key: key,
    setting_value: value as Json,
  });

  if (error) {
    console.error("[admin-settings] Failed to update setting", { error, key });
    return {
      error: error.message,
      ok: false,
    };
  }

  return {
    error: null,
    ok: true,
  };
}
