import { agentActionCatalog } from "@/lib/agent/catalog";
import type { AgentConversationState, AgentModelInterpretation } from "@/lib/agent/types";

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
};

const defaultModel = "gemini-2.5-flash";

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

export async function interpretMessageWithGemini({
  message,
  state,
}: InterpretMessageInput): Promise<AgentModelInterpretation> {
  if (typeof window !== "undefined") {
    throw new GeminiConfigurationError("A Gemini API só pode ser chamada no servidor.");
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.GEMINI_MODEL?.trim() || defaultModel;

  if (!apiKey) {
    throw new GeminiConfigurationError("Faltando GEMINI_API_KEY no servidor.");
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: buildInterpretationPrompt({ message, state }) }],
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
      throw new GeminiProviderError("Tive uma instabilidade agora para processar sua mensagem. Tente novamente em instantes.");
    }

    return parseInterpretation(text);
  } catch (error) {
    if (error instanceof GeminiConfigurationError || error instanceof GeminiProviderError) {
      throw error;
    }

    console.error("Gemini unexpected error", error);
    throw new GeminiProviderError("Tive uma instabilidade agora para processar sua mensagem. Tente novamente em instantes.");
  }
}

function buildInterpretationPrompt({ message, state }: InterpretMessageInput) {
  return [
    "Você interpreta mensagens de um usuário do FechouMEI, um app financeiro simples para MEI.",
    "Responda somente JSON válido, sem markdown.",
    "O nome da assistente é Helena, a assistente financeira do FechouMEI.",
    "Não execute ações. Apenas identifique intenção e campos extraídos.",
    "Classifique kind como greeting, small_talk, capabilities, product_question, read_query, write_action, confirmation, cancelation, correction, unsupported_or_unknown ou interruption.",
    "Use capabilities quando o usuÃ¡rio perguntar o que o agente pode fazer, como funciona ou pedir exemplos.",
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
    throw new GeminiProviderError("Tive uma instabilidade agora para processar sua mensagem. Tente novamente em instantes.");
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
    return "A inteligência do agente atingiu o limite de uso agora. Tente novamente em instantes.";
  }

  if (status >= 500 || status === 408) {
    return "Tive uma instabilidade agora para processar sua mensagem. Tente novamente em instantes.";
  }

  return "Não consegui processar sua mensagem agora. Tente novamente em instantes.";
}
