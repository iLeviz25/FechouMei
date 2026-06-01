import {
  classifyDeterministically,
  inferTransactionEditCorrection,
} from "@/lib/agent/classifier";
import {
  type AgentExecutionContext,
  executeTransactionDeletion,
  executeTransactionEdit,
  getLatestMovement,
} from "@/lib/agent/executors";
import { runAgentTurnForContext } from "@/lib/agent/orchestrator";
import {
  type AgentActionTrace,
  type AgentConversationChannel,
  type AgentConversationState,
  type AgentDeleteTarget,
  type AgentLastWriteContext,
  type AgentTransactionEditDraft,
  type AgentTurnResult,
  type MovementType,
  type TransactionTargetKind,
} from "@/lib/agent/types";
import {
  detectConfirmation,
  emptyAgentState,
  formatDateLabel,
  makeAgentState,
  parseAmountFromText,
  toCurrency,
  toDateInputValue,
} from "@/lib/agent/utils";
import { parseTransactionMessage } from "@/lib/agent/transaction-parser";
import { formatDisplayTextForWhatsApp } from "@/lib/agent/replies";
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

  if (isPendingSensitiveWriteState(state)) {
    const tool = state.pendingAction === "delete_transaction" ? "request_transaction_delete" : "request_transaction_edit";
    logAgentV2WriteTool({
      stage: "started",
      tool,
      userId: context.userId,
    });

    const result = await handlePendingSensitiveWrite({
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

  const contextualDelete = getContextualDeleteRequest(message, state);

  if (contextualDelete) {
    const tool = "request_transaction_delete";
    logAgentV2WriteTool({
      stage: "started",
      tool,
      userId: context.userId,
    });

    const result = await createDeleteConfirmationTurn({
      context,
      message,
      request: contextualDelete,
      state,
    });

    logAgentV2WriteTool({
      stage: "finished",
      stateStatus: result.state.status,
      tool,
      userId: context.userId,
      wroteData: false,
    });

    return result;
  }

  const contextualEdit = getContextualEditRequest(message, state);

  if (contextualEdit) {
    const tool = "request_transaction_edit";
    logAgentV2WriteTool({
      stage: "started",
      tool,
      userId: context.userId,
    });

    const result = await createEditConfirmationTurn({
      context,
      request: contextualEdit,
      state,
    });

    logAgentV2WriteTool({
      stage: "finished",
      stateStatus: result.state.status,
      tool,
      userId: context.userId,
      wroteData: false,
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

type ContextualDeleteRequest = {
  allowLatestLookup: boolean;
  targetKind: TransactionTargetKind;
};

type ContextualEditRequest = {
  allowLatestLookup: boolean;
  editDraft: AgentTransactionEditDraft;
  targetKind: TransactionTargetKind;
};

async function handlePendingSensitiveWrite({
  context,
  message,
  state,
}: {
  context: AgentExecutionContext;
  message: string;
  state: AgentConversationState;
}): Promise<AgentTurnResult> {
  const sensitiveAction = getSensitivePendingAction(state);
  const confirmation = detectSensitiveConfirmation(message, state.pendingAction);

  if (confirmation === "no") {
    return {
      actionTrace: makeSensitiveActionTrace(sensitiveAction, "cancelled", "cancelled"),
      reply: state.pendingAction === "delete_transaction"
        ? "Tudo bem, mantive esse lançamento."
        : "Tudo bem, não alterei esse lançamento.",
      state: makeIdleStatePreservingRecentWrites(state),
    };
  }

  if (confirmation !== "yes") {
    return {
      reply: state.pendingAction === "delete_transaction"
        ? "Para excluir, responda com algo como \"sim, pode excluir\". Para manter, responda \"não\"."
        : "Para confirmar a alteração, responda \"sim\" ou \"confirmo\". Para cancelar, responda \"não\".",
      state,
    };
  }

  if (state.pendingAction === "delete_transaction") {
    if (!state.deleteTarget) {
      return {
        reply: "Não encontrei o lançamento pendente para excluir.",
        state: emptyAgentState(),
      };
    }

    try {
      await executeTransactionDeletion(context, state.deleteTarget);

      return {
        actionTrace: makeSensitiveActionTrace("delete_transaction", "executed", "confirmed"),
        reply: "Pronto, excluí esse lançamento.",
        state: emptyAgentState(),
      };
    } catch (error) {
      return makeSensitiveFailureResult({
        action: "delete_transaction",
        error,
        reply: "Não consegui excluir esse lançamento agora.\nPode tentar novamente em instantes?",
        state,
      });
    }
  }

  if (state.pendingAction === "edit_transaction") {
    if (!state.editTarget || !state.editDraft) {
      return {
        reply: "Não encontrei a alteração pendente para confirmar.",
        state: emptyAgentState(),
      };
    }

    try {
      const result = await executeTransactionEdit(
        context,
        state.editTarget,
        normalizeAgentV2EditDraft(state.editDraft),
        getTargetKindForMovement(state.editTarget),
      );

      return {
        actionTrace: makeSensitiveActionTrace("edit_transaction", "executed", "confirmed"),
        reply: result.reply,
        state: makeIdleStateWithLastWrite("edit_transaction", result.movement),
      };
    } catch (error) {
      return makeSensitiveFailureResult({
        action: "edit_transaction",
        error,
        reply: "Não consegui atualizar esse lançamento agora.\nPode tentar novamente em instantes?",
        state,
      });
    }
  }

  return {
    reply: "Ainda não consigo confirmar essa ação por aqui.",
    state: emptyAgentState(),
  };
}

async function createDeleteConfirmationTurn({
  context,
  request,
  state,
}: {
  context: AgentExecutionContext;
  message: string;
  request: ContextualDeleteRequest;
  state: AgentConversationState;
}): Promise<AgentTurnResult> {
  const target =
    pickRecentWriteTarget(state, request.targetKind) ??
    (request.allowLatestLookup ? await getLatestMovement(context, request.targetKind) : null);

  if (!target) {
    return {
      reply: "Não encontrei uma movimentação recente para excluir. Quer me dizer qual lançamento você quer apagar?",
      state,
    };
  }

  return {
    actionTrace: makeSensitiveActionTrace("delete_transaction", "confirmation_requested", "requested"),
    reply: [
      "Encontrei este lançamento:",
      "",
      formatMovementTargetForConfirmation(target),
      "",
      "Quer mesmo excluir?",
    ].join("\n"),
    state: makeAgentState({
      deleteTarget: target,
      expectedResponseKind: "confirm_delete",
      lastWrite: state.lastWrite,
      lastWrites: state.lastWrites,
      missingFields: [],
      pendingAction: "delete_transaction",
      status: "awaiting_confirmation",
    }),
  };
}

async function createEditConfirmationTurn({
  context,
  request,
  state,
}: {
  context: AgentExecutionContext;
  request: ContextualEditRequest;
  state: AgentConversationState;
}): Promise<AgentTurnResult> {
  const target =
    pickRecentWriteTarget(state, request.targetKind) ??
    (request.allowLatestLookup ? await getLatestMovement(context, request.targetKind) : null);

  if (!target) {
    return {
      reply: "Não encontrei uma movimentação recente para corrigir. Quer me dizer qual lançamento você quer alterar?",
      state,
    };
  }

  const editDraft = normalizeAgentV2EditDraft(request.editDraft);

  if (Object.keys(editDraft).length === 0 || isNoopEdit(target, editDraft)) {
    return {
      reply: "O que você quer corrigir nesse lançamento: valor, descrição, categoria, tipo ou data?",
      state,
    };
  }

  return {
    actionTrace: makeSensitiveActionTrace("edit_transaction", "confirmation_requested", "requested"),
    reply: buildEditConfirmationReply(target, editDraft),
    state: makeAgentState({
      editDraft,
      editTarget: target,
      expectedResponseKind: "confirm_save",
      lastWrite: state.lastWrite,
      lastWrites: state.lastWrites,
      missingFields: [],
      pendingAction: "edit_transaction",
      status: "awaiting_confirmation",
    }),
  };
}

function getContextualDeleteRequest(
  message: string,
  state: AgentConversationState,
): ContextualDeleteRequest | null {
  const normalized = normalizeToolText(message);
  const hasRecentWrite = Boolean(state.lastWrite || state.lastWrites?.length);
  const targetKind = inferTargetKindFromText(normalized);
  const explicitLatest = /\b(ultima|ultimo|ultimas|ultimos)\b/.test(normalized);
  const hasDeleteVerb = /\b(apaga|apagar|exclui|excluir|deleta|deletar|remove|remover)\b/.test(normalized);
  const mentionsMovement = /\b(movimentacao|movimentacoes|registro|lancamento|lancamentos|entrada|despesa)\b/.test(normalized);
  const contextualDelete =
    /^(apaga|apagar|exclui|excluir|deleta|deletar|remove|remover)\s+(essa|esse|isso|esta|este)\b/.test(normalized) ||
    /^desfaz\b/.test(normalized) ||
    /^cancela\s+(esse|essa|este|esta)\s+(lancamento|registro|movimentacao)\b/.test(normalized) ||
    (normalized === "cancela" && hasRecentWrite);

  if (contextualDelete) {
    return {
      allowLatestLookup: explicitLatest,
      targetKind,
    };
  }

  if (hasDeleteVerb && (explicitLatest || mentionsMovement)) {
    return {
      allowLatestLookup: true,
      targetKind,
    };
  }

  return null;
}

function getContextualEditRequest(
  message: string,
  state: AgentConversationState,
): ContextualEditRequest | null {
  const normalized = normalizeToolText(message);

  if (/^(nao entendi|nao sei|me explica|explique|explica|o que e|como funciona|como vejo)\b/.test(normalized)) {
    return null;
  }

  const explicitLatest = /\b(ultima|ultimo|ultimas|ultimos)\b/.test(normalized);
  const hasRecentWrite = Boolean(state.lastWrite || state.lastWrites?.length);
  const looksLikeEdit =
    /^(na verdade|corrige|corrigir|corrija|muda|mude|troca|troque|altera|altere|edita|edite|era|nao era|nao, era)\b/.test(normalized) ||
    /\b(descricao|categoria|valor|data|tipo)\b/.test(normalized);

  if (!looksLikeEdit) {
    return null;
  }

  const editDraft = normalizeAgentV2EditDraft({
    ...inferTransactionEditCorrection(message),
    ...inferExplicitAgentV2EditFields(message),
    type: inferTypeEdit(message),
  });

  if (Object.keys(editDraft).length === 0 && !explicitLatest && !hasRecentWrite) {
    return null;
  }

  return {
    allowLatestLookup: explicitLatest,
    editDraft,
    targetKind: explicitLatest ? inferTargetKindFromText(normalized) : "latest",
  };
}

function detectSensitiveConfirmation(
  message: string,
  pendingAction?: AgentConversationState["pendingAction"],
) {
  const normalized = normalizeToolText(message);
  const confirmation = detectConfirmation(message);

  if (confirmation !== "unclear") {
    return confirmation;
  }

  if (
    pendingAction === "delete_transaction" &&
    /^(exclui|excluir|apaga|apagar|deleta|deletar|remove|remover|pode excluir|pode apagar|sim pode apagar|sim pode excluir)\b/.test(normalized)
  ) {
    return "yes";
  }

  return "unclear";
}

function isPendingSensitiveWriteState(state: AgentConversationState) {
  return (
    state.status === "awaiting_confirmation" &&
    (state.pendingAction === "delete_transaction" || state.pendingAction === "edit_transaction")
  );
}

function getSensitivePendingAction(state: AgentConversationState) {
  return state.pendingAction === "delete_transaction" || state.pendingAction === "edit_transaction"
    ? state.pendingAction
    : undefined;
}

function pickRecentWriteTarget(
  state: AgentConversationState,
  targetKind: TransactionTargetKind,
): AgentDeleteTarget | null {
  const writes = state.lastWrites?.length
    ? state.lastWrites
    : state.lastWrite
      ? [state.lastWrite]
      : [];
  const matches = writes.filter((write) => targetMatchesKind(write, targetKind));

  return matches.at(-1)?.target ?? null;
}

function targetMatchesKind(write: AgentLastWriteContext, targetKind: TransactionTargetKind) {
  if (targetKind === "latest_income") {
    return write.target.type === "entrada";
  }

  if (targetKind === "latest_expense") {
    return write.target.type === "despesa";
  }

  return true;
}

function inferTargetKindFromText(normalized: string): TransactionTargetKind {
  if (/\b(entrada|receita|recebimento)\b/.test(normalized)) {
    return "latest_income";
  }

  if (/\b(despesa|gasto|saida)\b/.test(normalized)) {
    return "latest_expense";
  }

  return "latest";
}

function inferTypeEdit(message: string): MovementType | undefined {
  const normalized = normalizeToolText(message);
  const wantsIncome =
    /\b(era|foi|e|eh|correto|certo)\s+(entrada|receita|recebimento)\b/.test(normalized) ||
    /\bnao\s+(despesa|gasto|saida)\b/.test(normalized);
  const wantsExpense =
    /\b(era|foi|e|eh|correto|certo)\s+(despesa|gasto|saida)\b/.test(normalized) ||
    /\bnao\s+(entrada|receita|recebimento)\b/.test(normalized);

  if (wantsIncome && !wantsExpense) {
    return "entrada";
  }

  if (wantsExpense && !wantsIncome) {
    return "despesa";
  }

  if (wantsIncome && wantsExpense) {
    if (/^(era|foi|e|eh)\s+(entrada|receita|recebimento)/.test(normalized)) {
      return "entrada";
    }

    if (/^(era|foi|e|eh)\s+(despesa|gasto|saida)/.test(normalized)) {
      return "despesa";
    }
  }

  return undefined;
}

function inferExplicitAgentV2EditFields(message: string): AgentTransactionEditDraft {
  const description = readExplicitEditField(message, ["descricao", "descrição", "nome", "origem"]);
  const category = readExplicitEditField(message, ["categoria", "cat"]);

  return {
    category,
    description,
  };
}

function readExplicitEditField(message: string, labels: string[]) {
  const labelPattern = labels.join("|");
  const match = message.match(new RegExp(`\\b(?:a|o)?\\s*(?:${labelPattern})\\s*(?::|=|é|eh|era|para|pra|por)?\\s+(.+)$`, "i"));

  return match?.[1]?.trim();
}

function normalizeAgentV2EditDraft(editDraft: AgentTransactionEditDraft): AgentTransactionEditDraft {
  const normalized: AgentTransactionEditDraft = {};

  if (typeof editDraft.amount === "number" && editDraft.amount > 0) {
    normalized.amount = editDraft.amount;
  }

  if (editDraft.description?.trim()) {
    normalized.description = cleanupEditText(editDraft.description);
  }

  if (editDraft.category?.trim()) {
    normalized.category = cleanupEditText(editDraft.category);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(editDraft.occurred_on ?? "")) {
    normalized.occurred_on = editDraft.occurred_on;
  }

  if (editDraft.type === "entrada" || editDraft.type === "despesa") {
    normalized.type = editDraft.type;
  }

  return normalized;
}

function cleanupEditText(value: string) {
  return value
    .replace(/^(?:da|de|do)\s+(?:ultima|última|ultimo|último)\s+(?:entrada|despesa|movimentacao|movimentação|registro|lancamento|lançamento)\s+(?:para|pra|por)\s+/i, "")
    .replace(/^(?:para|pra|por)\s+/i, "")
    .replace(/[?.!]+$/g, "")
    .trim();
}

function isNoopEdit(target: AgentDeleteTarget, editDraft: AgentTransactionEditDraft) {
  return (
    (Object.keys(editDraft).length === 1 && editDraft.type === target.type) ||
    Object.keys(editDraft).length === 0
  );
}

function buildEditConfirmationReply(target: AgentDeleteTarget, editDraft: AgentTransactionEditDraft) {
  const targetLabel = target.type === "entrada" ? "última entrada" : "última despesa";
  const changeLines = getEditChangeLines(target, editDraft);

  return [
    `Você quer corrigir a ${targetLabel}?`,
    "",
    formatMovementTargetForConfirmation(target),
    "",
    ...changeLines,
    "",
    "Posso confirmar essa alteração?",
  ].join("\n");
}

function getEditChangeLines(target: AgentDeleteTarget, editDraft: AgentTransactionEditDraft) {
  const lines: string[] = [];

  if (typeof editDraft.amount === "number") {
    lines.push(`De: ${toCurrency(target.amount)}`);
    lines.push(`Para: ${toCurrency(editDraft.amount)}`);
  }

  if (editDraft.description) {
    lines.push(`De: ${formatDisplayTextForWhatsApp(target.description, "Sem descrição")}`);
    lines.push(`Para: ${formatDisplayTextForWhatsApp(editDraft.description)}`);
  }

  if (editDraft.category) {
    lines.push(`Categoria atual: ${formatDisplayTextForWhatsApp(target.category, "Sem categoria")}`);
    lines.push(`Nova categoria: ${formatDisplayTextForWhatsApp(editDraft.category)}`);
  }

  if (editDraft.type) {
    lines.push(`De: ${formatMovementTypeLabel(target.type)}`);
    lines.push(`Para: ${formatMovementTypeLabel(editDraft.type)}`);
  }

  if (editDraft.occurred_on) {
    lines.push(`Data atual: ${formatDateLabel(target.occurred_on)}`);
    lines.push(`Nova data: ${formatDateLabel(editDraft.occurred_on)}`);
  }

  return lines.length > 0 ? lines : ["Vou atualizar esse lançamento."];
}

function formatMovementTargetForConfirmation(target: AgentDeleteTarget) {
  const typeLabel = target.type === "entrada" ? "Entrada" : "Despesa";
  const connector = target.type === "entrada" ? "de" : "com";

  return [
    `${typeLabel} de ${toCurrency(target.amount)} ${connector} ${formatDisplayTextForWhatsApp(target.description, "Sem descrição")}`,
    `Data: ${formatDateLabel(target.occurred_on)}`,
  ].join("\n");
}

function formatMovementTypeLabel(type: MovementType) {
  return type === "entrada" ? "Entrada" : "Despesa";
}

function getTargetKindForMovement(target: AgentDeleteTarget): TransactionTargetKind {
  return target.type === "entrada" ? "latest_income" : "latest_expense";
}

function makeIdleStateWithLastWrite(
  action: AgentLastWriteContext["action"],
  target: AgentDeleteTarget,
) {
  const lastWrite: AgentLastWriteContext = {
    action,
    target,
    targetKind: getTargetKindForMovement(target),
    updatedAt: new Date().toISOString(),
  };

  return makeAgentState({
    lastWrite,
    lastWrites: [lastWrite],
    status: "idle",
  });
}

function makeIdleStatePreservingRecentWrites(state: AgentConversationState) {
  return makeAgentState({
    lastWrite: state.lastWrite,
    lastWrites: state.lastWrites,
    status: "idle",
  });
}

function makeSensitiveActionTrace(
  action: "delete_transaction" | "edit_transaction" | undefined,
  status: AgentActionTrace["status"],
  confirmation: AgentActionTrace["confirmation"],
) {
  return action
    ? {
        action,
        confirmation,
        status,
      }
    : undefined;
}

function makeSensitiveFailureResult({
  action,
  error,
  reply,
  state,
}: {
  action: "delete_transaction" | "edit_transaction";
  error: unknown;
  reply: string;
  state: AgentConversationState;
}): AgentTurnResult {
  console.warn("[HELENA_V2_TOOL_WARNING]", {
    error: error instanceof Error ? error.message : "unknown",
    tool: action,
    userRef: "***",
  });

  return {
    actionTrace: {
      action,
      confirmation: "confirmed",
      error: error instanceof Error ? error.message : "unknown",
      status: "failed",
    },
    reply,
    state,
  };
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
