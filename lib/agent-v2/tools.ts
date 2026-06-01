import type { AgentTurnResult } from "@/lib/agent/types";
import type { AgentExecutionContext } from "@/lib/agent/executors";
import {
  executeQuickPeriodQuery,
  executeReadAction,
  executeSpecificMovementQuery,
} from "@/lib/agent/executors";
import type { AgentConversationState } from "@/lib/agent/types";
import {
  detectAgentV2ReadToolRequest,
  type AgentV2ReadToolName,
  type AgentV2ReadToolRequest,
} from "@/lib/agent-v2/tool-schemas";
import { trimAgentV2Reply } from "@/lib/agent-v2/guardrails";

type ExecuteAgentV2ReadToolInput = {
  context: AgentExecutionContext;
  message: string;
  state: AgentConversationState;
};

export async function executeAgentV2ReadTool({
  context,
  message,
  state,
}: ExecuteAgentV2ReadToolInput): Promise<AgentTurnResult | null> {
  const request = detectAgentV2ReadToolRequest(message);

  if (!request) {
    return null;
  }

  logAgentV2Tool({
    stage: "started",
    tool: request.name,
    userId: context.userId,
  });

  try {
    const reply = await runReadTool(context, request);

    logAgentV2Tool({
      hasData: inferReplyHasData(reply),
      stage: "finished",
      tool: request.name,
      userId: context.userId,
    });

    return {
      actionTrace: {
        action: request.action,
        confirmation: "not_required",
        status: "executed",
        summary: `Helena v2 executou ${request.name}.`,
      },
      reply: trimAgentV2Reply(reply),
      state,
    };
  } catch (error) {
    console.warn("[HELENA_V2_TOOL_WARNING]", {
      error: error instanceof Error ? error.message : "unknown",
      tool: request.name,
      userRef: maskUserId(context.userId),
    });
    logAgentV2Tool({
      error: error instanceof Error ? error.message : "unknown",
      stage: "failed",
      tool: request.name,
      userId: context.userId,
    });

    return {
      actionTrace: {
        action: request.action,
        confirmation: "not_required",
        error: error instanceof Error ? error.message : "unknown",
        status: "failed",
        summary: `Helena v2 não conseguiu executar ${request.name}.`,
      },
      reply: [
        "Tive uma instabilidade para consultar esses dados agora.",
        "Pode tentar de novo em instantes?",
      ].join("\n"),
      state,
    };
  }
}

async function runReadTool(context: AgentExecutionContext, request: AgentV2ReadToolRequest) {
  if (request.name === "get_monthly_report" || request.name === "get_period_report") {
    return executeQuickPeriodQuery(context, request.input.periodQuery);
  }

  if (request.name === "get_recent_transactions") {
    return executeSpecificMovementQuery(context, request.input.specificMovementQuery);
  }

  return executeReadAction(context, "obligations_status");
}

function logAgentV2Tool(payload: {
  error?: string;
  hasData?: boolean;
  stage: "failed" | "finished" | "started";
  tool: AgentV2ReadToolName;
  userId: string;
}) {
  console.info("[HELENA_V2_TOOL]", {
    error: payload.error,
    hasData: payload.hasData,
    stage: payload.stage,
    tool: payload.tool,
    userRef: maskUserId(payload.userId),
  });
}

function inferReplyHasData(reply: string) {
  return !/\b(não encontrei|ainda não tem|não tem movimentações|não consegui)\b/i.test(reply);
}

function maskUserId(userId: string) {
  return userId.length <= 8
    ? "***"
    : `${userId.slice(0, 4)}***${userId.slice(-4)}`;
}
