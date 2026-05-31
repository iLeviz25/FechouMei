import { classifyDeterministically } from "@/lib/agent/classifier";
import {
  type AgentExecutionContext,
} from "@/lib/agent/executors";
import { runAgentTurnForContext } from "@/lib/agent/orchestrator";
import {
  type AgentConversationChannel,
  type AgentConversationState,
  type AgentTurnResult,
} from "@/lib/agent/types";
import { emptyAgentState } from "@/lib/agent/utils";
import { parseTransactionMessage } from "@/lib/agent/transaction-parser";
import {
  isAgentV2SupportedPendingMovementState,
} from "@/lib/agent-v2/guardrails";

type ExecuteAgentV2WriteToolInput = {
  channel?: AgentConversationChannel;
  context: AgentExecutionContext;
  message: string;
  state: AgentConversationState;
};

type AgentV2WriteToolName =
  | "cancel_pending_action"
  | "confirm_pending_action"
  | "create_expense_draft"
  | "create_income_draft"
  | "update_pending_draft";

export async function executeAgentV2WriteTool({
  channel = "whatsapp",
  context,
  message,
  state,
}: ExecuteAgentV2WriteToolInput): Promise<AgentTurnResult | null> {
  if (isAgentV2SupportedPendingMovementState(state)) {
    const tool = getPendingToolName(message);
    logAgentV2WriteTool({
      stage: "started",
      tool,
      userId: context.userId,
    });

    const result = await runAgentTurnForContext({
      channel,
      context,
      message,
      state,
    });

    logAgentV2WriteTool({
      stage: "finished",
      stateStatus: result.state.status,
      tool,
      userId: context.userId,
      wroteData: result.actionTrace?.status === "executed" && result.actionTrace.confirmation === "confirmed",
    });

    return result;
  }

  const draftTool = getDraftToolName(message);

  if (!draftTool) {
    return null;
  }

  logAgentV2WriteTool({
    stage: "started",
    tool: draftTool,
    userId: context.userId,
  });

  const result = await runAgentTurnForContext({
    channel,
    context,
    message,
    state: emptyAgentState(),
  });

  logAgentV2WriteTool({
    stage: "finished",
    stateStatus: result.state.status,
    tool: draftTool,
    userId: context.userId,
    wroteData: result.actionTrace?.status === "executed" && result.actionTrace.confirmation === "confirmed",
  });

  return result;
}

function getDraftToolName(message: string): Extract<AgentV2WriteToolName, "create_expense_draft" | "create_income_draft"> | null {
  if (!isLikelySingleMovementDraftRequest(message)) {
    return null;
  }

  const classification = classifyDeterministically(message, emptyAgentState());

  if (classification?.action === "register_income") {
    return "create_income_draft";
  }

  if (classification?.action === "register_expense") {
    return "create_expense_draft";
  }

  if (classification?.action === "register_movements_batch") {
    return null;
  }

  const explicitType = inferMovementDraftType(message);

  if (explicitType === "entrada" && parseTransactionMessage(message, "entrada")) {
    return "create_income_draft";
  }

  if (explicitType === "despesa" && parseTransactionMessage(message, "despesa")) {
    return "create_expense_draft";
  }

  return null;
}

function isLikelySingleMovementDraftRequest(message: string) {
  const normalized = normalizeToolText(message);

  if (
    /\b(quanto|qual|quais|como|relatorio|lucro|resultado|sobrou|ultimas|ultimos|obrigacao|obrigacoes|pendente|pendentes)\b/.test(
      normalized,
    )
  ) {
    return false;
  }

  return /\b(entrou|recebi|caiu|veio|ganhei|vendi|faturei|entrada|gastei|paguei|comprei|saiu|despesa|gasto|lanca|lancar|registrar|registre|registra|adiciona|adicionar)\b/.test(
    normalized,
  );
}

function inferMovementDraftType(message: string): "despesa" | "entrada" | null {
  const normalized = normalizeToolText(message);

  if (/\b(gastei|paguei|comprei|saiu|despesa|gasto|gastos|mercado|gasolina|internet)\b/.test(normalized)) {
    return "despesa";
  }

  if (/\b(entrou|recebi|caiu|veio|ganhei|vendi|faturei|entrada|receita|venda|pix cliente)\b/.test(normalized)) {
    return "entrada";
  }

  return null;
}

function getPendingToolName(message: string): AgentV2WriteToolName {
  const normalized = normalizeToolText(message);

  if (/^(nao entendi|nao sei|me explica|o que e|como funciona|como vejo)\b/.test(normalized)) {
    return "update_pending_draft";
  }

  if (/^(sim|s|ok|pode|pode salvar|confirmo|confirma|salva|salvar)\b/.test(normalized)) {
    return "confirm_pending_action";
  }

  if (/^(nao|n|cancela|cancelar|deixa pra la|nao salva|esquece)\b/.test(normalized)) {
    return "cancel_pending_action";
  }

  return "update_pending_draft";
}

function logAgentV2WriteTool(payload: {
  stage: "finished" | "started";
  stateStatus?: AgentConversationState["status"];
  tool: AgentV2WriteToolName;
  userId: string;
  wroteData?: boolean;
}) {
  console.info("[HELENA_V2_TOOL]", {
    stage: payload.stage,
    stateStatus: payload.stateStatus,
    tool: payload.tool,
    userRef: maskUserId(payload.userId),
    wroteData: payload.wroteData,
  });
}

function normalizeToolText(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function maskUserId(userId: string) {
  return userId.length <= 8
    ? "***"
    : `${userId.slice(0, 4)}***${userId.slice(-4)}`;
}
