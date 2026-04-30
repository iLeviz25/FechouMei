import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentConversationChannel } from "@/lib/agent/types";
import type { Database } from "@/types/database";

export type AgentRuntimeSettings = {
  helenaEnabled: boolean;
  maintenanceMode: boolean;
  maxAgentMessagesPerDay: number | null;
  whatsappEnabled: boolean;
};

export type AgentAvailabilityResult =
  | {
      allowed: true;
      settings: AgentRuntimeSettings;
    }
  | {
      allowed: false;
      eventType: "agent_disabled" | "agent_daily_limit_reached" | "agent_maintenance" | "whatsapp_disabled";
      reply: string;
      settings: AgentRuntimeSettings;
    };

type AgentRuntimeContext = {
  channel?: AgentConversationChannel;
  settings?: AgentRuntimeSettings;
  supabase: SupabaseClient<Database>;
  userId: string;
};

const defaultRuntimeSettings: AgentRuntimeSettings = {
  helenaEnabled: true,
  maintenanceMode: false,
  maxAgentMessagesPerDay: null,
  whatsappEnabled: true,
};

const helenaDisabledReply =
  "A Helena esta temporariamente indisponivel. Tente novamente em instantes.";
const maintenanceReply =
  "A Helena esta em manutencao rapida agora. Tente novamente em instantes.";
const whatsappDisabledReply =
  "O canal WhatsApp da Helena esta temporariamente indisponivel. Voce ainda pode usar a Helena dentro do app.";
const dailyLimitReply =
  "Voce atingiu o limite diario de mensagens da Helena. Tente novamente amanha.";

export async function getAgentRuntimeSettings(
  supabase: SupabaseClient<Database>,
): Promise<AgentRuntimeSettings> {
  const { data, error } = await supabase.rpc("get_agent_runtime_settings");

  if (error) {
    console.warn("[agent-runtime] Failed to load runtime settings; using defaults.", error);
    return defaultRuntimeSettings;
  }

  return parseRuntimeSettings(data);
}

export async function evaluateAgentAvailability(
  context: AgentRuntimeContext,
): Promise<AgentAvailabilityResult> {
  const settings = context.settings ?? await getAgentRuntimeSettings(context.supabase);
  const channel = context.channel ?? "playground";

  if (settings.maintenanceMode) {
    return {
      allowed: false,
      eventType: "agent_maintenance",
      reply: maintenanceReply,
      settings,
    };
  }

  if (!settings.helenaEnabled) {
    return {
      allowed: false,
      eventType: "agent_disabled",
      reply: helenaDisabledReply,
      settings,
    };
  }

  if (channel === "whatsapp" && !settings.whatsappEnabled) {
    return {
      allowed: false,
      eventType: "whatsapp_disabled",
      reply: whatsappDisabledReply,
      settings,
    };
  }

  const limit = settings.maxAgentMessagesPerDay;

  if (limit && limit > 0) {
    const usedToday = await countAgentUserMessagesToday(context);

    if (usedToday >= limit) {
      return {
        allowed: false,
        eventType: "agent_daily_limit_reached",
        reply: dailyLimitReply,
        settings,
      };
    }
  }

  return {
    allowed: true,
    settings,
  };
}

export async function logAgentRuntimeBlock(
  context: AgentRuntimeContext,
  result: Exclude<AgentAvailabilityResult, { allowed: true }>,
) {
  try {
    const { error } = await context.supabase.from("admin_audit_events").insert({
      event_type: result.eventType,
      message: result.reply,
      metadata: {
        channel: context.channel ?? "playground",
        maxAgentMessagesPerDay: result.settings.maxAgentMessagesPerDay,
      },
      origin: context.channel === "whatsapp" ? "whatsapp" : "helena",
      severity: "warning",
      status: "blocked",
      target_user_id: context.userId,
    });

    if (error) {
      console.warn("[agent-runtime] Runtime block event could not be persisted.", error);
    }
  } catch (error) {
    console.warn("[agent-runtime] Runtime block event could not be persisted.", error);
  }
}

async function countAgentUserMessagesToday(context: AgentRuntimeContext) {
  const { count, error } = await context.supabase
    .from("agent_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", context.userId)
    .eq("role", "user")
    .gte("created_at", getSaoPauloDayStartIso());

  if (error) {
    console.warn("[agent-runtime] Failed to count daily agent messages; allowing turn.", error);
    return 0;
  }

  return count ?? 0;
}

function parseRuntimeSettings(value: unknown): AgentRuntimeSettings {
  const record = asRecord(value);
  const maxMessages = readNumber(record.maxAgentMessagesPerDay);

  return {
    helenaEnabled: readBoolean(record.helenaEnabled, defaultRuntimeSettings.helenaEnabled),
    maintenanceMode: readBoolean(record.maintenanceMode, defaultRuntimeSettings.maintenanceMode),
    maxAgentMessagesPerDay: maxMessages && maxMessages > 0 ? Math.floor(maxMessages) : null,
    whatsappEnabled: readBoolean(record.whatsappEnabled, defaultRuntimeSettings.whatsappEnabled),
  };
}

function getSaoPauloDayStartIso(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
    year: "numeric",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  return new Date(Date.UTC(year, month - 1, day, 3, 0, 0, 0)).toISOString();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}
