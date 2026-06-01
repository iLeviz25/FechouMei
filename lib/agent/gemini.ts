import { agentActionCatalog } from "@/lib/agent/catalog";
import { recordAgentPromptTrace } from "@/lib/agent/prompt-tracing";
import type { AgentConversationState, AgentModelInterpretation } from "@/lib/agent/types";
import { emptyAgentState } from "@/lib/agent/utils";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentConversationChannel } from "@/lib/agent/types";
import type { Database, Json } from "@/types/database";

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

type InterpretMessageInput = {
  message: string;
  state: AgentConversationState;
  trace?: {
    channel?: AgentConversationChannel;
    supabase: SupabaseClient<Database>;
    userId: string;
  };
};

const defaultModel = "gemini-2.5-flash";
const friendlyProviderFallback = "Tive uma instabilidade agora para entender sua mensagem. Pode tentar de novo em instantes?";

export class GeminiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiConfigurationError";
  }
}

export class GeminiProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiProviderError";
  }
}

export type AgentPromptTemplate = {
  id: string;
  description: string;
  promptText: string;
  title: string;
};

export function getAgentPromptTemplates(): AgentPromptTemplate[] {
  return [
    {
      description: "Prompt principal usado para classificar intenção, ação e campos extraídos antes da Helena responder.",
      id: "helena.interpretation",
      promptText: buildInterpretationPrompt({
        message: "{{mensagem_do_usuario}}",
        state: emptyAgentState(),
      }),
      title: "Interpretação de mensagens",
    },
    {
      description: "Instrução usada na transcrição de áudio antes de enviar o texto para a Helena.",
      id: "helena.audio_transcription",
      promptText: [
        "Transcreva o áudio em português do Brasil.",
        "Retorne somente o texto transcrito.",
        "Não resuma, não explique e não adicione comentários.",
        "Se uma parte estiver inaudível, seja conservador e não invente.",
      ].join(" "),
      title: "Transcrição de áudio",
    },
  ];
}

export async function interpretMessageWithGemini({
  message,
  state,
  trace,
}: InterpretMessageInput): Promise<AgentModelInterpretation> {
  if (typeof window !== "undefined") {
    throw new GeminiConfigurationError("A Gemini API só pode ser chamada no servidor.");
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.GEMINI_MODEL?.trim() || defaultModel;
  const prompt = buildInterpretationPrompt({ message, state });

  if (!apiKey) {
    throw new GeminiConfigurationError("Faltando GEMINI_API_KEY no servidor.");
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          responseJsonSchema: {
            properties: {
              action: {
                enum: [...agentActionCatalog.map((action) => action.id), "unknown"],
                type: "string",
              },
              confidence: { enum: ["high", "medium", "low"], type: "string" },
              confirmation: { enum: ["yes", "no", "unclear"], type: "string" },
              kind: {
                enum: [
                  "greeting",
                  "small_talk",
                  "capabilities",
                  "product_question",
                  "read_query",
                  "write_action",
                  "confirmation",
                  "cancelation",
                  "correction",
                  "unsupported_or_unknown",
                  "interruption",
                ],
                type: "string",
              },
              fields: {
                properties: {
                  amount: { type: "number" },
                  category: { type: "string" },
                  description: { type: "string" },
                  occurred_on: { type: "string" },
                  type: { enum: ["entrada", "despesa"], type: "string" },
                },
                type: "object",
              },
            },
            required: ["action", "confidence", "kind"],
            type: "object",
          },
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      }),
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      method: "POST",
      signal: AbortSignal.timeout(12000),
    });

    const payload = (await response.json()) as GeminiGenerateContentResponse;

    if (!response.ok) {
      console.error("Gemini provider error", {
        message: payload.error?.message,
        status: response.status,
      });
      throw new GeminiProviderError(getFriendlyProviderError(response.status));
    }

    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();

    if (!text) {
      console.error("Gemini empty interpretation", { payload });
      throw new GeminiProviderError(friendlyProviderFallback);
    }

    const interpretation = parseInterpretation(text);
    await traceGeminiPrompt({
      actionName: interpretation.action,
      message,
      metadata: {
        confidence: interpretation.confidence,
        kind: interpretation.kind ?? "unsupported_or_unknown",
      },
      model,
      prompt,
      responseText: text,
      status: "success",
      trace,
    });

    return interpretation;
  } catch (error) {
    if (error instanceof GeminiConfigurationError || error instanceof GeminiProviderError) {
      await traceGeminiPrompt({
        actionName: null,
        message,
        metadata: {
          errorName: error.name,
        },
        model,
        prompt,
        responseText: error.message,
        status: "error",
        trace,
      });
      throw error;
    }

    console.error("Gemini unexpected error", error);
    await traceGeminiPrompt({
      actionName: null,
      message,
      metadata: {
        errorName: error instanceof Error ? error.name : "UnknownError",
      },
      model,
      prompt,
      responseText: error instanceof Error ? error.message : "Erro inesperado.",
      status: "error",
      trace,
    });
    throw new GeminiProviderError(friendlyProviderFallback);
  }
}

export function buildInterpretationPrompt({ message, state }: Omit<InterpretMessageInput, "trace">) {
  return [
    "Você interpreta mensagens de um usuário do FechouMEI, um app financeiro simples para MEI.",
    "Responda somente JSON válido, sem markdown.",
    "O nome da assistente é Helena, a assistente financeira do FechouMEI.",
    "Não execute ações. Apenas identifique intenção e campos extraídos.",
    "Classifique kind como greeting, small_talk, capabilities, product_question, read_query, write_action, confirmation, cancelation, correction, unsupported_or_unknown ou interruption.",
    "Use capabilities quando o usuário perguntar o que o agente pode fazer, como funciona ou pedir exemplos.",
    "Se houver rascunho pendente e o usuário corrigir valor, tipo, descrição, categoria ou data, use kind correction.",
    "Se houver rascunho pendente e o usuário fizer uma consulta, use kind interruption e a ação de leitura adequada.",
    "Para dúvidas, frustração ou fora de escopo, mantenha intenção curta e segura; a resposta final será controlada pelo app.",
    "Se a mensagem for confirmação de uma ação pendente, preencha confirmation.",
    "Use datas no formato YYYY-MM-DD apenas quando a mensagem trouxer data explícita. Se não trouxer data, não invente.",
    "Campos de movimentação: type, amount, description, category, occurred_on.",
    "type deve ser entrada ou despesa.",
    "Ações disponíveis:",
    agentActionCatalog.map((action) => `- ${action.id}: ${action.description}`).join("\n"),
    `Estado atual: ${JSON.stringify(state)}`,
    `Mensagem do usuário: ${message}`,
  ].join("\n\n");
}

async function traceGeminiPrompt({
  actionName,
  message,
  metadata,
  model,
  prompt,
  responseText,
  status,
  trace,
}: {
  actionName: string | null;
  message: string;
  metadata: Record<string, Json>;
  model: string;
  prompt: string;
  responseText: string | null;
  status: "success" | "error";
  trace: InterpretMessageInput["trace"];
}) {
  if (!trace) {
    return;
  }

  await recordAgentPromptTrace({
    actionName,
    channel: trace.channel,
    metadata,
    model,
    promptText: prompt,
    responseText,
    status,
    supabase: trace.supabase,
    traceType: "interpretation",
    userId: trace.userId,
    userMessage: message,
  });
}

function parseInterpretation(text: string): AgentModelInterpretation {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  let parsed: AgentModelInterpretation;

  try {
    parsed = JSON.parse(cleaned) as AgentModelInterpretation;
  } catch (error) {
    console.error("Gemini parsing error", { error, text });
    throw new GeminiProviderError(friendlyProviderFallback);
  }

  return {
    action: parsed.action ?? "unknown",
    confidence: parsed.confidence ?? "low",
    confirmation: parsed.confirmation ?? "unclear",
    fields: parsed.fields ?? {},
    kind: parsed.kind ?? "unsupported_or_unknown",
  };
}

function getFriendlyProviderError(status: number) {
  if (status === 429) {
    return friendlyProviderFallback;
  }

  if (status >= 500 || status === 408) {
    return friendlyProviderFallback;
  }

  return friendlyProviderFallback;
}
