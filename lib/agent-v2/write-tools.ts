import { classifyDeterministically } from "@/lib/agent/classifier";
import {
  type AgentExecutionContext,
} from "@/lib/agent/executors";
import { runAgentTurnForContext } from "@/lib/agent/orchestrator";
import {
  type AgentConversationChannel,
  type AgentConversationState,
  type AgentTurnResult,
  type MovementType,
} from "@/lib/agent/types";
import { emptyAgentState, makeAgentState, parseAmountFromText, toCurrency, toDateInputValue } from "@/lib/agent/utils";
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
  | "create_movement_batch_draft"
  | "create_expense_draft"
  | "create_income_draft"
  | "ask_movement_type"
  | "request_transaction_delete"
  | "request_transaction_edit"
  | "update_pending_draft";

export async function executeAgentV2WriteTool({
  channel = "whatsapp",
  context,
  message,
  state,
}: ExecuteAgentV2WriteToolInput): Promise<AgentTurnResult | null> {
  if (state.expectedResponseKind === "choose_movement_type") {
    const tool = "ask_movement_type";
    logAgentV2WriteTool({
      stage: "started",
      tool,
      userId: context.userId,
    });

    const result = handlePendingMovementTypeChoice(message, state);

    logAgentV2WriteTool({
      stage: "finished",
      stateStatus: result.state.status,
      tool,
      userId: context.userId,
      wroteData: false,
    });

    return result;
  }

  if (isAgentV2SupportedPendingMovementState(state)) {
    const tool = getPendingToolName(message);
    logAgentV2WriteTool({
      stage: "started",
      tool,
      userId: context.userId,
    });

    const delegatedResult = await runAgentTurnForContext({
      channel,
      context,
      message,
      state,
    });
    const result = await maybeAutoSaveSingleMovement({
      channel,
      context,
      initialState: state,
      result: delegatedResult,
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

  const sensitiveTool = getSensitiveWriteToolName(message);

  if (sensitiveTool) {
    logAgentV2WriteTool({
      stage: "started",
      tool: sensitiveTool,
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
      tool: sensitiveTool,
      userId: context.userId,
      wroteData: result.actionTrace?.status === "executed",
    });

    return result;
  }

  const draftTool = getDraftToolName(message);

  if (!draftTool) {
    if (isAmbiguousSingleMovementRequest(message)) {
      const result = createMovementTypeChoiceTurn(message, state);

      logAgentV2WriteTool({
        stage: "finished",
        stateStatus: result.state.status,
        tool: "ask_movement_type",
        userId: context.userId,
        wroteData: false,
      });

      return result;
    }

    return null;
  }

  logAgentV2WriteTool({
    stage: "started",
    tool: draftTool,
    userId: context.userId,
  });

  const delegatedResult = await runAgentTurnForContext({
    channel,
    context,
    message,
    state: emptyAgentState(),
  });
  const result = await maybeAutoSaveSingleMovement({
    channel,
    context,
    initialState: emptyAgentState(),
    result: delegatedResult,
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

function createMovementTypeChoiceTurn(message: string, state: AgentConversationState): AgentTurnResult {
  const amount = parseAmountFromText(message);

  if (!amount) {
    return {
      reply: "Esse valor foi entrada ou despesa?",
      state,
    };
  }

  return {
    reply: `Esse valor de ${toCurrency(amount)} foi entrada ou despesa?`,
    state: makeAgentState({
      draft: {
        amount,
        occurred_on: toDateInputValue(new Date()),
      },
      expectedResponseKind: "choose_movement_type",
      missingFields: [],
      status: "collecting",
    }),
  };
}

function handlePendingMovementTypeChoice(message: string, state: AgentConversationState): AgentTurnResult {
  const type = inferMovementTypeChoice(message);
  const amount = state.draft?.amount;

  if (!type) {
    return {
      reply: amount
        ? `Esse valor de ${toCurrency(amount)} foi entrada ou despesa?`
        : "Esse valor foi entrada ou despesa?",
      state,
    };
  }

  const action = type === "entrada" ? "register_income" : "register_expense";
  const draft = {
    ...(state.draft ?? {}),
    occurred_on: state.draft?.occurred_on ?? toDateInputValue(new Date()),
    type,
  };

  return {
    actionTrace: {
      action,
      confirmation: "not_required",
      status: "collecting",
      summary: `Coletando descrição para registrar ${type}.`,
    },
    reply: getDescriptionCollectionReply(type, amount),
    state: makeAgentState({
      draft,
      expectedResponseKind: "missing_description",
      missingFields: ["description"],
      pendingAction: action,
      status: "collecting",
    }),
  };
}

function getDraftToolName(message: string): Extract<AgentV2WriteToolName, "create_expense_draft" | "create_income_draft" | "create_movement_batch_draft"> | null {
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
    return "create_movement_batch_draft";
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

function getSensitiveWriteToolName(message: string): Extract<AgentV2WriteToolName, "request_transaction_delete" | "request_transaction_edit"> | null {
  const classification = classifyDeterministically(message, emptyAgentState());

  if (classification?.action === "delete_transaction") {
    return "request_transaction_delete";
  }

  if (classification?.action === "edit_transaction") {
    return "request_transaction_edit";
  }

  return null;
}

async function maybeAutoSaveSingleMovement({
  channel,
  context,
  initialState,
  result,
}: {
  channel: AgentConversationChannel;
  context: AgentExecutionContext;
  initialState: AgentConversationState;
  result: AgentTurnResult;
}) {
  if (initialState.status === "awaiting_confirmation") {
    return result;
  }

  if (
    result.actionTrace?.status !== "confirmation_requested" ||
    result.state.status !== "awaiting_confirmation" ||
    (result.state.pendingAction !== "register_income" && result.state.pendingAction !== "register_expense")
  ) {
    return result;
  }

  return runAgentTurnForContext({
    channel,
    context,
    message: "sim",
    state: result.state,
  });
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

function inferMovementTypeChoice(message: string): MovementType | null {
  const normalized = normalizeToolText(message);
  const isIncome = /\b(entrada|receita|recebimento|entrou|recebi|ganho|ganhei|venda|vendi)\b/.test(normalized);
  const isExpense = /\b(despesa|gasto|saida|saiu|paguei|pagamento|pago|compra|comprei)\b/.test(normalized);

  if (isIncome && !isExpense) {
    return "entrada";
  }

  if (isExpense && !isIncome) {
    return "despesa";
  }

  return null;
}

function getDescriptionCollectionReply(type: MovementType, amount?: number) {
  const amountLabel = amount ? ` de ${toCurrency(amount)}` : "";

  return type === "entrada"
    ? `Essa entrada${amountLabel} foi referente a quê? Exemplo: venda, pix de cliente, serviço...`
    : `Esse gasto${amountLabel} foi com o quê? Exemplo: gasolina, internet, fornecedor, mercado...`;
}

function isAmbiguousSingleMovementRequest(message: string) {
  const normalized = normalizeToolText(message);

  if (!/\b(lanca|lancar|lance|registra|registrar|registre|adiciona|adicionar|coloca|colocar)\b/.test(normalized)) {
    return false;
  }

  if (!/\b\d+(?:[,.]\d+)?\b/.test(normalized)) {
    return false;
  }

  return !/\b(entrada|receita|recebi|entrou|caiu|veio|vendi|faturei|despesa|gasto|gastei|paguei|comprei|saiu)\b/.test(normalized);
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
