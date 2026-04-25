import { createClient } from "@/lib/supabase/server";
import { getAgentPromptTemplates, type AgentPromptTemplate } from "@/lib/agent/gemini";
import type { Json } from "@/types/database";

export type AdminHelenaConnection = {
  userId: string;
  fullName: string | null;
  email: string | null;
  whatsappStatus: string;
  maskedPhone: string | null;
  linkedAt: string | null;
  lastInboundAt: string | null;
  lastActivityAt: string | null;
  messagesCount: number;
  errorsCount: number;
};

export type AdminHelenaEvent = {
  createdAt: string | null;
  userId: string | null;
  userName: string | null;
  email: string | null;
  source: string;
  eventType: string;
  status: string;
  result: "success" | "error";
  summary: string | null;
};

export type AdminHelenaDashboard = {
  available: boolean;
  error: string | null;
  stats: {
    linkedUsers: number;
    unlinkedUsers: number;
    totalMessages: number;
    recentErrors: number;
  };
  connections: AdminHelenaConnection[];
  events: AdminHelenaEvent[];
};

export type AdminHelenaPromptTrace = {
  actionName: string | null;
  channel: string;
  createdAt: string | null;
  id: string;
  metadata: Json;
  model: string | null;
  promptPreview: string | null;
  promptText: string | null;
  responsePreview: string | null;
  status: "success" | "error" | "skipped";
  traceType: string;
  userEmail: string | null;
  userId: string | null;
  userMessagePreview: string | null;
  userName: string | null;
};

export type AdminHelenaPromptsResult = {
  available: boolean;
  error: string | null;
  templates: AgentPromptTemplate[];
  traces: AdminHelenaPromptTrace[];
  total: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function asStatus(value: unknown): AdminHelenaPromptTrace["status"] {
  return value === "error" || value === "skipped" ? value : "success";
}

function createUnavailableDashboard(error: string | null): AdminHelenaDashboard {
  return {
    available: false,
    connections: [],
    error,
    events: [],
    stats: {
      linkedUsers: 0,
      recentErrors: 0,
      totalMessages: 0,
      unlinkedUsers: 0,
    },
  };
}

function parseConnections(value: unknown): AdminHelenaConnection[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = asRecord(item);
    const userId = asString(record.userId);

    if (!userId) {
      return [];
    }

    return [
      {
        userId,
        fullName: asString(record.fullName),
        email: asString(record.email),
        whatsappStatus: asString(record.whatsappStatus) ?? "none",
        maskedPhone: asString(record.maskedPhone),
        linkedAt: asString(record.linkedAt),
        lastInboundAt: asString(record.lastInboundAt),
        lastActivityAt: asString(record.lastActivityAt),
        messagesCount: asNumber(record.messagesCount),
        errorsCount: asNumber(record.errorsCount),
      },
    ];
  });
}

function parseEvents(value: unknown): AdminHelenaEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = asRecord(item);
    const source = asString(record.source);
    const eventType = asString(record.eventType);

    if (!source || !eventType) {
      return [];
    }

    return [
      {
        createdAt: asString(record.createdAt),
        userId: asString(record.userId),
        userName: asString(record.userName),
        email: asString(record.email),
        source,
        eventType,
        status: asString(record.status) ?? "recorded",
        result: record.result === "error" ? "error" : "success",
        summary: asString(record.summary),
      },
    ];
  });
}

export async function getAdminHelenaDashboard(): Promise<AdminHelenaDashboard> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_admin_helena_dashboard");

  if (error) {
    console.error("[admin-helena] Failed to load dashboard", error);
    return createUnavailableDashboard(error.message);
  }

  const payload = asRecord(data);
  const stats = asRecord(payload.stats);

  return {
    available: true,
    error: null,
    stats: {
      linkedUsers: asNumber(stats.linkedUsers),
      recentErrors: asNumber(stats.recentErrors),
      totalMessages: asNumber(stats.totalMessages),
      unlinkedUsers: asNumber(stats.unlinkedUsers),
    },
    connections: parseConnections(payload.connections),
    events: parseEvents(payload.events),
  };
}

export async function getAdminHelenaPrompts(): Promise<AdminHelenaPromptsResult> {
  const templates = getAgentPromptTemplates();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_admin_agent_prompts", {
    page_offset: 0,
    page_size: 50,
    search_text: null,
    status_filter: null,
    type_filter: null,
  });

  if (error) {
    console.error("[admin-helena] Failed to load prompt traces", error);
    return {
      available: false,
      error: error.message,
      templates,
      total: 0,
      traces: [],
    };
  }

  const payload = asRecord(data);

  return {
    available: true,
    error: null,
    templates,
    total: asNumber(payload.total),
    traces: parsePromptTraces(payload.prompts),
  };
}

function parsePromptTraces(value: unknown): AdminHelenaPromptTrace[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = asRecord(item);
    const id = asString(record.id);

    if (!id) {
      return [];
    }

    return [
      {
        actionName: asString(record.actionName),
        channel: asString(record.channel) ?? "playground",
        createdAt: asString(record.createdAt),
        id,
        metadata: (record.metadata ?? null) as Json,
        model: asString(record.model),
        promptPreview: asString(record.promptPreview),
        promptText: asString(record.promptText),
        responsePreview: asString(record.responsePreview),
        status: asStatus(record.status),
        traceType: asString(record.traceType) ?? "interpretation",
        userEmail: asString(record.userEmail),
        userId: asString(record.userId),
        userMessagePreview: asString(record.userMessagePreview),
        userName: asString(record.userName),
      },
    ];
  });
}
