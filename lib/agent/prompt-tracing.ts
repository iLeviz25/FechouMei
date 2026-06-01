import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentConversationChannel } from "@/lib/agent/types";
import type { Database, Json } from "@/types/database";

export type AgentPromptTraceInput = {
  actionName?: string | null;
  channel?: AgentConversationChannel;
  metadata?: Record<string, Json | undefined>;
  model?: string | null;
  promptText: string;
  responseText?: string | null;
  status?: "success" | "error" | "skipped";
  supabase: SupabaseClient<Database>;
  traceType?: "interpretation" | "transcription" | "routing" | "fallback";
  userId: string;
  userMessage?: string | null;
};

const maxPromptLength = 20_000;
const maxUserMessagePreviewLength = 500;
const maxResponsePreviewLength = 1_000;

export async function recordAgentPromptTrace(input: AgentPromptTraceInput) {
  try {
    const { error } = await input.supabase.rpc("record_agent_prompt_trace", {
      action_name: input.actionName ?? null,
      metadata: sanitizeMetadata(input.metadata ?? {}),
      prompt_text: truncate(input.promptText, maxPromptLength),
      response_text: truncate(input.responseText ?? "", maxResponsePreviewLength),
      target_user_id: input.userId,
      trace_channel: input.channel ?? "playground",
      trace_model: input.model ?? null,
      trace_status: input.status ?? "success",
      trace_type: input.traceType ?? "interpretation",
      user_message: truncate(input.userMessage ?? "", maxUserMessagePreviewLength),
    });

    if (error) {
      console.warn("[agent-prompt-trace] Prompt trace could not be persisted.", error);
    }
  } catch (error) {
    console.warn("[agent-prompt-trace] Prompt trace failed without interrupting Helena.", error);
  }
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function sanitizeMetadata(metadata: Record<string, Json | undefined>): Json {
  const safe: Record<string, Json> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (!value || isSensitiveKey(key)) {
      continue;
    }

    safe[key] = sanitizeJson(value);
  }

  return safe;
}

function sanitizeJson(value: Json): Json {
  if (typeof value === "string") {
    return redactSensitiveText(truncate(value, 1000));
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map(sanitizeJson);
  }

  const safe: Record<string, Json> = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    if (nestedValue === undefined || isSensitiveKey(key)) {
      continue;
    }

    safe[key] = sanitizeJson(nestedValue);
  }

  return safe;
}

function isSensitiveKey(key: string) {
  return /(authorization|cookie|key|password|secret|senha|token)/i.test(key);
}

function redactSensitiveText(value: string) {
  return value
    .replace(/(bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[redacted]")
    .replace(/(api[_-]?key|service[_-]?role|token|secret|password|senha)(\s*[:=]\s*)\S+/gi, "$1$2[redacted]");
}
