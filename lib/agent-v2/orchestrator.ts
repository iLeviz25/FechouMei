import type {
  AgentConversationChannel,
  AgentConversationState,
  AgentTurnResult,
} from "@/lib/agent/types";
import type { AgentExecutionContext } from "@/lib/agent/executors";
import {
  findAgentV2KnowledgeAnswer,
  normalizeKnowledgeText,
} from "@/lib/agent-v2/product-knowledge";
import {
  getAgentV2ScopeRefusal,
  getAgentV2WriteBlockedReply,
  isAgentV2WriteIntent,
  trimAgentV2Reply,
} from "@/lib/agent-v2/guardrails";
import { buildAgentV2SystemPrompt } from "@/lib/agent-v2/system-prompt";
import { executeAgentV2ReadTool } from "@/lib/agent-v2/tools";
import { executeAgentV2WriteTool } from "@/lib/agent-v2/write-tools";
import { emptyAgentState } from "@/lib/agent/utils";

type RunAgentV2TurnInput = {
  channel?: AgentConversationChannel;
  context: AgentExecutionContext;
  message: string;
  state?: AgentConversationState | null;
};

type GeminiV2Response = {
  reply?: string;
};

const defaultGeminiModel = "gemini-2.5-flash";

export async function runAgentV2TurnForContext({
  context,
  message,
  state,
}: RunAgentV2TurnInput): Promise<AgentTurnResult> {
  const trimmedMessage = message.trim();
  const currentState = state ?? emptyAgentState();

  if (!trimmedMessage) {
    return {
      reply: "Me diga o que você quer entender ou organizar no FechouMEI.",
      state: currentState,
    };
  }

  const scopeRefusal = getAgentV2ScopeRefusal(trimmedMessage);

  if (scopeRefusal) {
    return {
      reply: scopeRefusal,
      state: currentState,
    };
  }

  const writeToolResult = await executeAgentV2WriteTool({
    context,
    message: trimmedMessage,
    state: currentState,
  });

  if (writeToolResult) {
    return writeToolResult;
  }

  const readToolResult = await executeAgentV2ReadTool({
    context,
    message: trimmedMessage,
    state: currentState,
  });

  if (readToolResult) {
    return readToolResult;
  }

  if (currentState.status !== "idle") {
    return {
      reply: "Temos um rascunho pendente. Responda 'sim' para salvar, 'cancelar' para descartar ou me mande uma correção curta.",
      state: currentState,
    };
  }

  if (isAgentV2WriteIntent(trimmedMessage)) {
    return {
      reply: getAgentV2WriteBlockedReply(),
      state: currentState,
    };
  }

  const normalized = normalizeKnowledgeText(trimmedMessage);

  if (isGreeting(normalized)) {
    return {
      reply: "Oi! Eu sou a Helena, do FechouMEI 😊\n\nPosso te ajudar a entender melhor suas entradas, despesas, relatórios, fechamento mensal e organização do MEI.",
      state: currentState,
    };
  }

  const knowledgeAnswer = findAgentV2KnowledgeAnswer(trimmedMessage);

  if (knowledgeAnswer) {
    return {
      reply: trimAgentV2Reply(knowledgeAnswer.answer),
      state: currentState,
    };
  }

  const geminiReply = await generateAgentV2GeminiReply(trimmedMessage);

  return {
    reply: geminiReply ?? [
      "Posso te ajudar com dúvidas sobre o FechouMEI, entradas, despesas, lucro, relatórios, fechamento mensal e obrigações.",
      "",
      "Me conta em uma frase o que você quer organizar agora.",
    ].join("\n"),
    state: currentState,
  };
}

async function generateAgentV2GeminiReply(message: string) {
  if (!shouldUseGeminiForAgentV2()) {
    return null;
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  const model = process.env.HELENA_V2_GEMINI_MODEL?.trim() || process.env.GEMINI_MODEL?.trim() || defaultGeminiModel;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: [
                  buildAgentV2SystemPrompt(),
                  "",
                  "Responda somente JSON válido no formato {\"reply\":\"...\"}.",
                  "Mensagem do usuário:",
                  message,
                ].join("\n"),
              },
            ],
          },
        ],
        generationConfig: {
          responseJsonSchema: {
            properties: {
              reply: { type: "string" },
            },
            required: ["reply"],
            type: "object",
          },
          responseMimeType: "application/json",
          temperature: 0.35,
        },
      }),
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      method: "POST",
      signal: AbortSignal.timeout(10000),
    });

    const payload = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      console.warn("[HELENA_V2_GEMINI_WARNING]", {
        message: payload.error?.message,
        status: response.status,
      });
      return null;
    }

    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();

    if (!text) {
      return null;
    }

    const parsed = JSON.parse(cleanGeminiJson(text)) as GeminiV2Response;
    const reply = parsed.reply?.trim();

    return reply ? trimAgentV2Reply(reply) : null;
  } catch (error) {
    console.warn("[HELENA_V2_GEMINI_WARNING]", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

function shouldUseGeminiForAgentV2() {
  const flag = process.env.HELENA_V2_GEMINI_ENABLED?.trim().toLowerCase();

  if (flag && /^(0|false|off|no)$/i.test(flag)) {
    return false;
  }

  return true;
}

function cleanGeminiJson(text: string) {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function isGreeting(normalized: string) {
  return /^(oi|ola|olá|bom dia|boa tarde|boa noite|e ai|e aí|hello|helo)$/.test(normalized);
}
