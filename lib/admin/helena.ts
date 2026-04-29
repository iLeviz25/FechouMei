import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getAgentPromptTemplates, type AgentPromptTemplate } from "@/lib/agent/gemini";
import { createServiceRoleClient } from "@/lib/supabase/admin";
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

export type AdminHelenaTechnicalHealthStatus = "ok" | "warning" | "unavailable";

export type AdminHelenaTechnicalHealthCard = {
  detail: string;
  label: string;
  status: AdminHelenaTechnicalHealthStatus;
  value: string;
};

export type AdminHelenaTechnicalHealth = {
  cards: AdminHelenaTechnicalHealthCard[];
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

const countFormatter = new Intl.NumberFormat("pt-BR");

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

function isMissingDatabaseObject(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = (error.message ?? "").toLowerCase();

  return (
    error.code === "42P01" ||
    error.code === "42883" ||
    error.code === "PGRST202" ||
    error.code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("could not find the function")
  );
}

function countValue(count: number | null) {
  return typeof count === "number" && Number.isFinite(count) ? count : 0;
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

export async function getAdminHelenaTechnicalHealth(): Promise<AdminHelenaTechnicalHealth> {
  const webhookSecretConfigured = Boolean(process.env.WHATSAPP_WEBHOOK_SECRET?.trim());
  const webhookCard: AdminHelenaTechnicalHealthCard = webhookSecretConfigured
    ? {
        detail: "WHATSAPP_WEBHOOK_SECRET configurado no servidor.",
        label: "Webhook WhatsApp",
        status: "ok",
        value: "Protegido",
      }
    : {
        detail: "Configure WHATSAPP_WEBHOOK_SECRET para bloquear POSTs sem token.",
        label: "Webhook WhatsApp",
        status: "warning",
        value: "Atenção",
      };

  let admin: ReturnType<typeof createServiceRoleClient>;

  try {
    admin = createServiceRoleClient();
  } catch (error) {
    console.error("[admin-helena] Failed to initialize technical health client", error);
    return {
      cards: [
        webhookCard,
        createUnavailableHealthCard("Fila da Helena", "Admin client indisponivel para checar fila."),
        createUnavailableHealthCard("Locks ativos", "Admin client indisponivel para contar locks."),
        createUnavailableHealthCard("Turnos pendentes", "Admin client indisponivel para contar turnos."),
        createUnavailableHealthCard("Falhas 24h", "Admin client indisponivel para contar falhas."),
        createUnavailableHealthCard("Instabilidades Gemini/Helena 24h", "Admin client indisponivel para contar traces."),
      ],
    };
  }

  const nowIso = new Date().toISOString();
  const last24HoursIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [
    queueTableCheck,
    lockTableCheck,
    rpcCheck,
    activeLocks,
    pendingTurns,
    failedTurns,
    helenaInstabilities,
  ] = await Promise.all([
    admin.from("agent_turn_queue").select("id", { count: "exact", head: true }),
    admin.from("agent_conversation_locks").select("user_id", { count: "exact", head: true }),
    admin.rpc("claim_agent_turn", {
      lock_ttl_seconds: 30,
      queue_item_id: randomUUID(),
    }),
    admin
      .from("agent_conversation_locks")
      .select("user_id", { count: "exact", head: true })
      .gt("expires_at", nowIso),
    admin
      .from("agent_turn_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "waiting")
      .gt("expires_at", nowIso),
    admin
      .from("agent_turn_queue")
      .select("id", { count: "exact", head: true })
      .in("status", ["failed", "expired", "abandoned"])
      .gte("finished_at", last24HoursIso),
    admin
      .from("agent_prompt_traces")
      .select("id", { count: "exact", head: true })
      .eq("status", "error")
      .gte("created_at", last24HoursIso),
  ]);

  const queueMissing =
    isMissingDatabaseObject(queueTableCheck.error) ||
    isMissingDatabaseObject(lockTableCheck.error) ||
    isMissingDatabaseObject(rpcCheck.error);
  const rpcPayload = asRecord(rpcCheck.data);
  const queueActive =
    !queueMissing &&
    !queueTableCheck.error &&
    !lockTableCheck.error &&
    !rpcCheck.error &&
    rpcPayload.claimed === false &&
    rpcPayload.reason === "missing_queue_item";

  return {
    cards: [
      webhookCard,
      queueActive
        ? {
            detail: "Tabelas e RPC claim_agent_turn responderam sem ambiguidade.",
            label: "Fila da Helena",
            status: "ok",
            value: "Ativa",
          }
        : createUnavailableHealthCard(
            "Fila da Helena",
            queueMissing ? "Tabelas ou RPCs da fila ainda nao existem." : "A checagem da fila nao respondeu como esperado.",
          ),
      createCountHealthCard({
        count: activeLocks.count,
        detail: "Locks nao expirados em agent_conversation_locks.",
        error: activeLocks.error,
        label: "Locks ativos",
        warningWhenPositive: true,
      }),
      createCountHealthCard({
        count: pendingTurns.count,
        detail: "Turnos waiting ainda dentro do TTL.",
        error: pendingTurns.error,
        label: "Turnos pendentes",
        warningWhenPositive: true,
      }),
      createCountHealthCard({
        count: failedTurns.count,
        detail: "Turnos failed, expired ou abandoned finalizados nas ultimas 24h.",
        error: failedTurns.error,
        label: "Falhas 24h",
        warningWhenPositive: true,
      }),
      createCountHealthCard({
        count: helenaInstabilities.count,
        detail: "Fonte: agent_prompt_traces com status error nas ultimas 24h.",
        error: helenaInstabilities.error,
        label: "Instabilidades Gemini/Helena 24h",
        warningWhenPositive: true,
      }),
    ],
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

function createUnavailableHealthCard(label: string, detail: string): AdminHelenaTechnicalHealthCard {
  return {
    detail,
    label,
    status: "unavailable",
    value: "Nao configurado",
  };
}

function createCountHealthCard({
  count,
  detail,
  error,
  label,
  warningWhenPositive,
}: {
  count: number | null;
  detail: string;
  error: { code?: string; message?: string } | null;
  label: string;
  warningWhenPositive: boolean;
}): AdminHelenaTechnicalHealthCard {
  if (error) {
    return createUnavailableHealthCard(
      label,
      isMissingDatabaseObject(error) ? "Tabela ainda nao configurada." : "Nao foi possivel carregar este indicador.",
    );
  }

  const safeCount = countValue(count);

  return {
    detail,
    label,
    status: warningWhenPositive && safeCount > 0 ? "warning" : "ok",
    value: countFormatter.format(safeCount),
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
