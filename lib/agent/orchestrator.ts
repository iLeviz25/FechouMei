import { createClient } from "@/lib/supabase/server";
import {
  classifyDeterministically,
  inferDescriptionReplacement,
  inferCorrectionFields,
  inferPartialFieldAnswer,
  inferTransactionEditCorrection,
} from "@/lib/agent/classifier";
import { getAgentCapabilitiesReply } from "@/lib/agent/capabilities";
import { getActionDefinition, implementedAgentActions } from "@/lib/agent/catalog";
import { getReliableMovementMissingFields } from "@/lib/agent/draft-sufficiency";
import {
  type AgentExecutionContext,
  executeInitialBalanceUpdate,
  executeMarkObligation,
  executeMovementBatchRegistration,
  executeMovementRegistration,
  executeQuickPeriodQuery,
  executeReadAction,
  executeReminderPreferencesUpdate,
  executeSpecificMovementQuery,
  executeTransactionEdit,
  executeTransactionDeletion,
  formatMovementForDeletion,
  getLatestMovement,
  getLatestTransactionReply,
  getLatestMovementForDeletion,
} from "@/lib/agent/executors";
import {
  GeminiConfigurationError,
  GeminiProviderError,
  interpretMessageWithGemini,
} from "@/lib/agent/gemini";
import {
  canonicalizeCategoryInput,
  cleanDescriptionUsingResolvedCategory,
  cleanTransactionDescription,
  inferCategoryFromDescription,
  parseTransactionMessage,
} from "@/lib/agent/transaction-parser";
import type {
  AgentActionId,
  AgentActionTrace,
  AgentConversationState,
  AgentDeleteTarget,
  AgentExpectedResponseKind,
  AgentLastWriteContext,
  AgentModelInterpretation,
  AgentMovementDraft,
  AgentTransactionEditDraft,
  AgentTurnResult,
  MovementField,
  MovementType,
  TransactionTargetKind,
} from "@/lib/agent/types";
import {
  detectConfirmation,
  emptyAgentState,
  formatDateLabel,
  getMissingFieldsQuestion,
  makeAgentState,
  mergeDraftWithPlainAnswer,
  normalizeMovementDraft,
  parseAmountFromText,
  toCurrency,
  toDateInputValue,
} from "@/lib/agent/utils";

type RunAgentTurnInput = {
  message: string;
  state?: AgentConversationState | null;
};

type CompoundExpenseHandling =
  | {
      batch: AgentMovementDraft[];
      combinedDraft?: AgentMovementDraft;
      kind: "batch";
    }
  | {
      batch: AgentMovementDraft[];
      combinedDraft: AgentMovementDraft;
      kind: "choose_split_or_combined";
      reply: string;
    };

type SplitOrCombinedChoice = "combined" | "split";

export async function runAgentTurn({ message, state }: RunAgentTurnInput): Promise<AgentTurnResult> {
  const trimmedMessage = message.trim();
  const currentState = normalizeConversationState(state);

  if (!trimmedMessage) {
    return {
      reply: "Me diga o que você quer fazer no FechouMEI.",
      state: currentState,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      reply: "Faça login novamente para usar o agente.",
      state: emptyAgentState(),
    };
  }

  const context: AgentExecutionContext = { supabase, userId: user.id };

  try {
    const deterministic = classifyDeterministically(trimmedMessage, currentState);

    if (deterministic) {
      const deterministicResult = await handleDeterministicClassification({
        context,
        currentState,
        message: trimmedMessage,
        result: deterministic,
      });

      if (deterministicResult) {
        return deterministicResult;
      }
    }

    const expectedChoiceResult = handleExpectedChoiceResponse(trimmedMessage, currentState);

    if (expectedChoiceResult) {
      return expectedChoiceResult;
    }

    if (currentState.status === "awaiting_confirmation") {
      return handleAwaitingConfirmationFallback(currentState);
    }

    if (currentState.status === "collecting") {
      return handleCollectingTurn({ context, message: trimmedMessage, state: currentState });
    }

    const interpretation = await safeGeminiInterpretation(trimmedMessage, currentState);

    if (!interpretation) {
      return {
        reply: "Tive uma instabilidade agora para processar sua mensagem. Tente novamente em instantes.",
        state: currentState,
      };
    }

    return handleModelInterpretation({
      context,
      currentState,
      interpretation,
      message: trimmedMessage,
    });
  } catch (error) {
    if (error instanceof GeminiConfigurationError) {
      console.error("Agent Gemini configuration error", error);
      return {
        actionTrace: getFailureTrace(currentState, "Falha de configuração do provider."),
        reply: "Tive uma instabilidade agora para processar isso. Tente novamente em instantes.",
        state: currentState,
      };
    }

    if (error instanceof GeminiProviderError) {
      console.error("Agent Gemini provider error", error);
      return {
        actionTrace: getFailureTrace(currentState, "Falha do provider."),
        reply: `Tive uma instabilidade agora para processar isso. Tente novamente em instantes.${currentState.status !== "idle" ? " Seu rascunho continua salvo." : ""}`,
        state: currentState,
      };
    }

    console.error("Agent unexpected error", error);

    return {
      actionTrace: getFailureTrace(currentState, getErrorSummary(error)),
      reply: "Não consegui concluir isso agora. Tente novamente em instantes.",
      state: currentState,
    };
  }
}

export async function runAgentTurnForContext({
  context,
  message,
  state,
}: RunAgentTurnInput & { context: AgentExecutionContext }): Promise<AgentTurnResult> {
  const trimmedMessage = message.trim();
  const currentState = normalizeConversationState(state);

  if (!trimmedMessage) {
    return {
      reply: "Me diga o que você quer fazer no FechouMEI.",
      state: currentState,
    };
  }

  try {
    const deterministic = classifyDeterministically(trimmedMessage, currentState);

    if (deterministic) {
      const deterministicResult = await handleDeterministicClassification({
        context,
        currentState,
        message: trimmedMessage,
        result: deterministic,
      });

      if (deterministicResult) {
        return deterministicResult;
      }
    }

    const expectedChoiceResult = handleExpectedChoiceResponse(trimmedMessage, currentState);

    if (expectedChoiceResult) {
      return expectedChoiceResult;
    }

    if (currentState.status === "awaiting_confirmation") {
      return handleAwaitingConfirmationFallback(currentState);
    }

    if (currentState.status === "collecting") {
      return handleCollectingTurn({ context, message: trimmedMessage, state: currentState });
    }

    const interpretation = await safeGeminiInterpretation(trimmedMessage, currentState);

    if (!interpretation) {
      return {
        reply: "Tive uma instabilidade agora para processar sua mensagem. Tente novamente em instantes.",
        state: currentState,
      };
    }

    return handleModelInterpretation({
      context,
      currentState,
      interpretation,
      message: trimmedMessage,
    });
  } catch (error) {
    if (error instanceof GeminiConfigurationError) {
      console.error("Agent Gemini configuration error", error);
      return {
        actionTrace: getFailureTrace(currentState, "Falha de configuração do provider."),
        reply: "Tive uma instabilidade agora para processar isso. Tente novamente em instantes.",
        state: currentState,
      };
    }

    if (error instanceof GeminiProviderError) {
      console.error("Agent Gemini provider error", error);
      return {
        actionTrace: getFailureTrace(currentState, "Falha do provider."),
        reply: `Tive uma instabilidade agora para processar isso. Tente novamente em instantes.${currentState.status !== "idle" ? " Seu rascunho continua salvo." : ""}`,
        state: currentState,
      };
    }

    console.error("Agent unexpected error", error);

    return {
      actionTrace: getFailureTrace(currentState, getErrorSummary(error)),
      reply: "Não consegui concluir isso agora. Tente novamente em instantes.",
      state: currentState,
    };
  }
}

async function handleDeterministicClassification({
  context,
  currentState,
  message,
  result,
}: {
  context: AgentExecutionContext;
  currentState: AgentConversationState;
  message: string;
  result: NonNullable<ReturnType<typeof classifyDeterministically>>;
}): Promise<AgentTurnResult | null> {
  if (currentState.expectedResponseKind === "choose_split_or_combined") {
    const splitChoice = detectSplitOrCombinedChoice(message);

    if (splitChoice) {
      return handleSplitOrCombinedChoiceTurn({
        choice: splitChoice,
        context,
        state: currentState,
      });
    }
  }

  if (result.kind === "cancelation") {
    return {
      actionTrace: getCancellationTrace(currentState),
      reply: currentState.status === "idle" ? "Tudo bem. Não havia nada pendente." : "Combinado, cancelei o rascunho pendente.",
      state: emptyAgentState(),
    };
  }

  if (result.kind === "confirmation") {
    if (currentState.expectedResponseKind === "choose_split_or_combined") {
      return {
        reply: "Me diga se quer lançar junto ou separado.",
        state: currentState,
      };
    }

    return handleConfirmationTurn({ context, message, state: currentState });
  }

  if (result.kind === "capabilities") {
    return {
      reply: getAgentCapabilitiesReply(currentState),
      state: currentState,
    };
  }

  if (result.kind === "greeting" || result.kind === "small_talk") {
    return {
      reply: result.reply ?? "Estou por aqui. Posso te ajudar com seu financeiro.",
      state: currentState,
    };
  }

  if (result.reply && !result.action) {
    return {
      reply: result.reply,
      state: currentState,
    };
  }

  if (result.kind === "correction") {
    return handleCorrectionTurn({
      context,
      currentState,
      message,
    });
  }

  if (result.action === "latest_transaction") {
    const reply = await getLatestTransactionReply(context, result.transactionTarget ?? "latest");

    return {
      reply: appendResumeHint(reply, currentState),
      state: currentState,
    };
  }

  if (result.action === "quick_period_query" && result.periodQuery) {
    const reply = await executeQuickPeriodQuery(context, result.periodQuery);

    return {
      reply: appendResumeHint(reply, currentState),
      state: currentState,
    };
  }

  if (result.action === "specific_movement_query" && result.specificMovementQuery) {
    const reply = await executeSpecificMovementQuery(context, result.specificMovementQuery);

    return {
      reply: appendResumeHint(reply, currentState),
      state: currentState,
    };
  }

  if (result.readActions?.length) {
    const reply = await executeReadActions(context, result.readActions);

    return {
      reply: appendResumeHint(reply, currentState),
      state: currentState,
    };
  }

  if (result.kind === "read_query" || (result.kind === "interruption" && result.action && isReadAction(result.action))) {
    const reply = await executeReadAction(context, result.action as AgentActionId);
    return {
      reply: appendResumeHint(reply, currentState),
      state: currentState,
    };
  }

  if (result.action === "delete_transaction") {
    if (currentState.status !== "idle") {
      return {
        reply: "Você já tem um rascunho pendente. Cancele o rascunho antes de excluir uma movimentação.",
        state: currentState,
      };
    }

    return handleDeleteRequest(context);
  }

  if (result.action === "mark_obligation") {
    if (currentState.status !== "idle") {
      return {
        reply: "Você já tem algo pendente. Cancele antes de marcar uma obrigação.",
        state: currentState,
      };
    }

    if (!result.obligationKey) {
      return {
        actionTrace: makeActionTrace("mark_obligation", "collecting", {
          summary: "Coletando qual obrigação marcar.",
        }),
        reply: "Qual obrigação você quer marcar: DAS, entradas, despesas, fechamento ou comprovantes?",
        state: makeAgentState({
          pendingAction: "mark_obligation",
          status: "collecting",
        }),
      };
    }

    try {
      const reply = await executeMarkObligation(context, result.obligationKey);

      return {
        actionTrace: makeActionTrace("mark_obligation", "executed", {
          confirmation: "not_required",
          summary: reply,
        }),
        reply,
        state: emptyAgentState(),
      };
    } catch (error) {
      return makeWriteFailureResult({
        action: "mark_obligation",
        error,
        reply: "Não consegui marcar essa obrigação agora. Tente novamente em instantes.",
        summary: "Falha ao marcar obrigação.",
      });
    }
  }

  if (result.action === "update_reminder_preferences") {
    if (currentState.status !== "idle") {
      return {
        reply: "Você já tem algo pendente. Cancele antes de mudar os lembretes.",
        state: currentState,
      };
    }

    if (!result.reminderUpdate) {
      return {
        actionTrace: makeActionTrace("update_reminder_preferences", "collecting", {
          summary: "Coletando ativação ou desativação dos lembretes.",
        }),
        reply: "Você quer ativar ou desativar os lembretes?",
        state: makeAgentState({
          pendingAction: "update_reminder_preferences",
          status: "collecting",
        }),
      };
    }

    try {
      const reply = await executeReminderPreferencesUpdate(context, result.reminderUpdate);

      return {
        actionTrace: makeActionTrace("update_reminder_preferences", "executed", {
          confirmation: "not_required",
          summary: reply,
        }),
        reply,
        state: emptyAgentState(),
      };
    } catch (error) {
      return makeWriteFailureResult({
        action: "update_reminder_preferences",
        error,
        reply: "Não consegui atualizar seus lembretes agora. Tente novamente em instantes.",
        summary: "Falha ao atualizar preferências de lembrete.",
      });
    }
  }

  if (result.action === "set_initial_balance") {
    if (currentState.status !== "idle") {
      return {
        reply: "Você já tem algo pendente. Cancele antes de ajustar seu saldo.",
        state: currentState,
      };
    }

    if (typeof result.initialBalanceAmount !== "number") {
      return {
        reply: "Qual valor você quer usar como saldo atual?",
        state: currentState,
      };
    }

    try {
      const reply = await executeInitialBalanceUpdate(context, result.initialBalanceAmount);

      return {
        actionTrace: makeActionTrace("set_initial_balance", "executed", {
          confirmation: "not_required",
          summary: reply,
        }),
        reply,
        state: emptyAgentState(),
      };
    } catch (error) {
      return makeWriteFailureResult({
        action: "set_initial_balance",
        confirmation: "not_required",
        error,
        reply: "Não consegui ajustar seu saldo agora. Tente novamente em instantes.",
        summary: "Falha ao ajustar saldo.",
      });
    }
  }

  if (result.action === "edit_transaction") {
    if (currentState.status !== "idle") {
      return {
        reply: "Você já tem algo pendente. Cancele antes de editar uma movimentação.",
        state: currentState,
      };
    }

    return handleTransactionEditTurn({
      context,
      editDraft: result.editDraft ?? {},
      missingFields: result.missingFields ?? [],
      targetKind: result.transactionTarget ?? "latest",
    });
  }

  if (result.action === "register_movements_batch") {
    if (currentState.status !== "idle") {
      return {
        reply: "Você já tem um rascunho pendente. Cancele ou confirme antes de começar outro lote.",
        state: currentState,
      };
    }

    return handleMovementBatchTurn({
      context,
      drafts: result.drafts ?? [],
      readAction: result.readAction,
    });
  }

  if (result.action && isMovementRegistrationAction(result.action)) {
    if (currentState.status !== "idle") {
      return {
        reply: "Você já tem um registro pendente. Quer cancelar esse rascunho e começar outro, ou prefere continuar o atual?",
        state: withExpectedResponseKind(currentState, "choose_cancel_or_continue"),
      };
    }

    const type = result.action === "register_income" ? "entrada" : "despesa";

    return handleMovementRegistrationTurn({
      confidence: result.confidence,
      context,
      draft: result.draft ?? {},
      sourceMessage: message,
      type,
    });
  }

  return null;
}

async function handleCorrectionTurn({
  context,
  currentState,
  message,
}: {
  context: AgentExecutionContext;
  currentState: AgentConversationState;
  message: string;
}): Promise<AgentTurnResult> {
  if (currentState.pendingAction === "register_movements_batch" && currentState.movementBatch?.length) {
    const correctedBatch = applyMovementBatchCorrection(currentState.movementBatch, message);

    if (!correctedBatch) {
      return {
        reply: "O que você quer corrigir nesse lote: valor, descrição, categoria ou data?",
        state: currentState,
      };
    }

    return handleMovementBatchTurn({
      context,
      drafts: correctedBatch,
    });
  }

  if (currentState.pendingAction === "edit_transaction") {
    const correction = inferTransactionEditCorrection(message, currentState.missingFields ?? []);

    if (Object.keys(correction).length === 0) {
      return {
        reply: "O que você quer corrigir nessa edição: valor, descrição ou categoria?",
        state: currentState,
      };
    }

    const editDraft = {
      ...(currentState.editDraft ?? {}),
      ...correction,
    };

    return handleTransactionEditTurn({
      context,
      editDraft,
      existingTarget: currentState.editTarget,
      missingFields: getMissingEditFieldsForDraft(currentState.missingFields ?? [], editDraft),
      targetKind: getTargetKindFromState(currentState),
    });
  }

  if (
    currentState.pendingAction !== "register_income" &&
    currentState.pendingAction !== "register_expense"
  ) {
    if (currentState.status === "idle" && (currentState.lastWrites?.length || currentState.lastWrite)) {
      const correction = inferTransactionEditCorrection(message);
      const targetContext = pickRecentWriteForCorrection(currentState, message, correction);

      if (Object.keys(correction).length === 0 || !targetContext) {
        return {
          reply: "O que você quer corrigir na última movimentação: valor, descrição, categoria ou data?",
          state: currentState,
        };
      }

      return handleTransactionEditTurn({
        context,
        editDraft: correction,
        existingTarget: targetContext.target,
        missingFields: [],
        targetKind: targetContext.targetKind,
      });
    }

    return {
      reply: "Não tenho um rascunho para corrigir agora. Me diga o que você quer registrar ou consultar.",
      state: currentState,
    };
  }

  const correction = inferCorrectionFields(message);

  if (Object.keys(correction).length === 0) {
    return {
      reply: "O que você quer corrigir no rascunho: valor, descrição ou categoria?",
      state: currentState,
    };
  }

  const type = correction.type ?? (currentState.pendingAction === "register_income" ? "entrada" : "despesa");

  return handleMovementRegistrationTurn({
    context,
    draft: {
      ...(currentState.draft ?? {}),
      ...correction,
    },
    sourceMessage: message,
    type,
  });
}

async function handleModelInterpretation({
  context,
  currentState,
  interpretation,
  message,
}: {
  context: AgentExecutionContext;
  currentState: AgentConversationState;
  interpretation: AgentModelInterpretation;
  message: string;
}): Promise<AgentTurnResult> {
  if (interpretation.kind === "capabilities" || interpretation.kind === "product_question") {
    return {
      reply: getAgentCapabilitiesReply(currentState),
      state: currentState,
    };
  }

  if (interpretation.kind === "greeting") {
    return {
      reply: "Oi! Me manda o que voce precisa registrar ou consultar.",
      state: currentState,
    };
  }

  if (interpretation.kind === "small_talk") {
    return {
      reply: "Posso conversar um pouco, mas meu foco e te ajudar com a rotina financeira do MEI.",
      state: currentState,
    };
  }

  if (false) {
    return {
      reply:
        interpretation.kind === "greeting"
          ? "Oi! Posso te ajudar com entradas, despesas, resumo do mês e obrigações."
          : "Posso conversar um pouco, mas meu melhor papel é te ajudar com a rotina financeira do MEI.",
      state: currentState,
    };
  }

  if (interpretation.kind === "cancelation") {
    return {
      actionTrace: getCancellationTrace(currentState),
      reply: "Combinado, cancelei o que estava pendente.",
      state: emptyAgentState(),
    };
  }

  if (interpretation.kind === "correction") {
    return handleCorrectionTurn({
      context,
      currentState,
      message,
    });
  }

  if (interpretation.action === "unknown" || interpretation.confidence === "low") {
    return {
      reply: "Nao peguei direitinho. Voce pode me pedir para registrar entrada ou despesa, ver resumo do mes, limite do MEI, pendencias ou ultimos registros.",
      state: currentState,
    };
  }

  if (false) {
    return {
      reply: "Não entendi com segurança. Você pode pedir para registrar entrada/despesa, ver resumo, limite, obrigações ou registros recentes.",
      state: currentState,
    };
  }

  if (!implementedAgentActions.has(interpretation.action)) {
    return {
      reply: getPlannedActionReply(interpretation.action),
      state: currentState,
    };
  }

  if (interpretation.action === "latest_transaction") {
    const reply = await getLatestTransactionReply(context, "latest");

    return {
      reply: appendResumeHint(reply, currentState),
      state: currentState.status === "idle" ? emptyAgentState() : currentState,
    };
  }

  if (interpretation.action === "delete_transaction") {
    if (currentState.status !== "idle") {
      return {
        reply: "Você já tem um rascunho pendente. Cancele o rascunho antes de excluir uma movimentação.",
        state: currentState,
      };
    }

    return handleDeleteRequest(context);
  }

  if (interpretation.action === "mark_obligation") {
    return {
      actionTrace: makeActionTrace("mark_obligation", "collecting", {
        summary: "Coletando qual obrigação marcar.",
      }),
      reply: "Qual obrigação você quer marcar: DAS, entradas, despesas, fechamento ou comprovantes?",
      state: makeAgentState({
        pendingAction: "mark_obligation",
        status: "collecting",
      }),
    };
  }

  if (interpretation.action === "update_reminder_preferences") {
    return {
      actionTrace: makeActionTrace("update_reminder_preferences", "collecting", {
        summary: "Coletando ativação ou desativação dos lembretes.",
      }),
      reply: "Você quer ativar ou desativar os lembretes?",
      state: makeAgentState({
        pendingAction: "update_reminder_preferences",
        status: "collecting",
      }),
    };
  }

  if (interpretation.action === "edit_transaction") {
    return {
      actionTrace: makeActionTrace("edit_transaction", "collecting", {
        summary: "Coletando alvo da edição rápida.",
      }),
      reply: "Quer editar a última movimentação, a última entrada ou a última despesa?",
      state: currentState,
    };
  }

  if (interpretation.action === "register_movements_batch") {
    return {
      reply: "Me mande as entradas e despesas com valor e descrição para eu preparar uma confirmação única.",
      state: currentState,
    };
  }

  if (isMovementRegistrationAction(interpretation.action)) {
    if (currentState.status !== "idle") {
      return {
        reply: "Você já tem um registro pendente. Quer cancelar esse rascunho e começar outro, ou prefere continuar o atual?",
        state: withExpectedResponseKind(currentState, "choose_cancel_or_continue"),
      };
    }

    const type = interpretation.action === "register_income" ? "entrada" : "despesa";

    return handleMovementRegistrationTurn({
      confidence: interpretation.confidence,
      context,
      draft: applyLocalExtraction(message, interpretation.fields ?? {}, type),
      sourceMessage: message,
      type,
    });
  }

  const reply = await executeReadAction(context, interpretation.action);

  return {
    reply: appendResumeHint(reply, currentState),
    state: currentState.status === "idle" ? emptyAgentState() : currentState,
  };
}

async function handleConfirmationTurn({
  context,
  message,
  state,
}: {
  context: AgentExecutionContext;
  message: string;
  state: AgentConversationState;
}): Promise<AgentTurnResult> {
  const confirmation = detectConfirmation(message);

  if (state.status === "idle") {
    return {
      reply: confirmation === "yes" ? "Certo. O que você quer fazer agora?" : "Tudo bem. O que você quer consultar ou registrar?",
      state,
    };
  }

  if (state.expectedResponseKind === "choose_cancel_or_continue" && confirmation === "yes") {
    return {
      reply: "Para eu seguir certo: você quer cancelar o rascunho atual ou continuar com ele?",
      state,
    };
  }

  if (confirmation === "no") {
    return {
      actionTrace: getCancellationTrace(state),
      reply: state.pendingAction === "delete_transaction" ? "Tudo bem, mantive a movimentação." : "Tudo bem, não salvei nada.",
      state: emptyAgentState(),
    };
  }

  if (confirmation !== "yes") {
    return handleAwaitingConfirmationFallback(state);
  }

  if (state.pendingAction === "delete_transaction") {
    if (!state.deleteTarget) {
      return {
        reply: "Não encontrei a movimentação pendente para excluir.",
        state: emptyAgentState(),
      };
    }

    try {
      const reply = await executeTransactionDeletion(context, state.deleteTarget);

      return {
        actionTrace: makeActionTrace("delete_transaction", "executed", {
          confirmation: "confirmed",
          summary: reply,
        }),
        reply,
        state: emptyAgentState(),
      };
    } catch (error) {
      return makeWriteFailureResult({
        action: "delete_transaction",
        confirmation: "confirmed",
        error,
        reply: "Não consegui excluir essa movimentação agora. Tente novamente em instantes.",
        state,
        summary: "Falha ao excluir a movimentação pendente.",
      });
    }
  }

  if (state.pendingAction === "register_movements_batch" && state.movementBatch?.length) {
    const normalizedBatch = normalizeMovementBatchDrafts(state.movementBatch);
    const missingBatch = getFirstBatchMissingFields(normalizedBatch);

    if (missingBatch) {
      return {
        actionTrace: makeActionTrace("register_movements_batch", "collecting", {
          summary: "Coletando dados para registrar lote de movimentações.",
        }),
        reply: getBatchMissingFieldsReply(missingBatch.index, missingBatch.draft, missingBatch.missingFields),
        state: makeAgentState({
          expectedResponseKind: getExpectedResponseKindForMissingFields(missingBatch.missingFields),
          movementBatch: normalizedBatch,
          pendingAction: "register_movements_batch",
          status: "collecting",
        }),
      };
    }

    return executeConfirmedMovementBatch(context, normalizedBatch as Array<Required<AgentMovementDraft>>, state);
  }

  if (state.pendingAction !== "register_income" && state.pendingAction !== "register_expense") {
    return {
      reply: "Ainda não consigo confirmar essa ação por aqui.",
      state: emptyAgentState(),
    };
  }

  const type = state.pendingAction === "register_income" ? "entrada" : "despesa";
  const draft = normalizeMovementDraft(state.draft ?? {}, type);
  const missingFields = getPracticalMissingFields(draft);

  if (missingFields.length > 0) {
    return {
      actionTrace: makeActionTrace(state.pendingAction, "collecting", {
        summary: `Coletando dados para registrar ${type}.`,
      }),
      reply: getMissingFieldsQuestion(type, missingFields),
      state: makeAgentState({
        draft,
        expectedResponseKind: getExpectedResponseKindForMissingFields(missingFields),
        missingFields,
        pendingAction: state.pendingAction,
        status: "collecting",
      }),
    };
  }

  try {
    const result = await executeMovementRegistration(context, draft as Required<AgentMovementDraft>);

    return {
      actionTrace: makeActionTrace(state.pendingAction, "executed", {
        confirmation: "confirmed",
        summary: result.reply,
      }),
      reply: result.reply,
      state: makeIdleStateWithLastWrite(state.pendingAction, result.movement),
    };
  } catch (error) {
    return makeWriteFailureResult({
      action: state.pendingAction,
      confirmation: "confirmed",
      error,
      reply: "Não consegui salvar essa movimentação agora. Tente novamente em instantes.",
      state,
      summary: `Falha ao registrar ${type}.`,
    });
  }
}

async function handleCollectingTurn({
  context,
  message,
  state,
}: {
  context: AgentExecutionContext;
  message: string;
  state: AgentConversationState;
}): Promise<AgentTurnResult> {
  const pendingAction = state.pendingAction;

  if (pendingAction === "register_movements_batch") {
    const batchAwaitingAmounts = shouldCollectBatchAmounts(state.movementBatch ?? []);
    const providedAmountsCount = extractAmountsFromText(message).length;

    if (batchAwaitingAmounts && providedAmountsCount > 0) {
      return handleMovementBatchAmountTurn({
        context,
        message,
        state,
      });
    }

    if (state.expectedResponseKind === "choose_split_or_combined") {
      const splitChoice = detectSplitOrCombinedChoice(message);

      if (splitChoice) {
        return handleSplitOrCombinedChoiceTurn({
          choice: splitChoice,
          context,
          state,
        });
      }

      return {
        reply: "Me diga se quer lançar junto ou separado.",
        state,
      };
    }

    if (isCorrectionLikeMessage(message)) {
      const correctedBatch = applyMovementBatchCorrection(state.movementBatch ?? [], message);

      if (correctedBatch) {
        return handleMovementBatchTurn({
          context,
          drafts: correctedBatch,
        });
      }
    }

    if (batchAwaitingAmounts) {
      return handleMovementBatchAmountTurn({
        context,
        message,
        state,
      });
    }

    return {
      reply: "Para esse lote, confirme, cancele ou envie uma correção curta.",
      state,
    };
  }

  if (pendingAction === "mark_obligation") {
    const classification = classifyDeterministically(message, emptyAgentState());

    if (classification?.obligationKey) {
      try {
        const reply = await executeMarkObligation(context, classification.obligationKey);

        return {
          actionTrace: makeActionTrace("mark_obligation", "executed", {
            confirmation: "not_required",
            summary: reply,
          }),
          reply,
          state: emptyAgentState(),
        };
      } catch (error) {
        return makeWriteFailureResult({
          action: "mark_obligation",
          error,
          reply: "Não consegui marcar essa obrigação agora. Tente novamente em instantes.",
          state,
          summary: "Falha ao marcar obrigação.",
        });
      }
    }

    return {
      actionTrace: makeActionTrace("mark_obligation", "collecting", {
        summary: "Coletando qual obrigação marcar.",
      }),
      reply: "Qual obrigação você quer marcar: DAS, entradas, despesas, fechamento ou comprovantes?",
      state,
    };
  }

  if (pendingAction === "update_reminder_preferences") {
    const classification = classifyDeterministically(message, emptyAgentState());

    if (classification?.reminderUpdate) {
      try {
        const reply = await executeReminderPreferencesUpdate(context, classification.reminderUpdate);

        return {
          actionTrace: makeActionTrace("update_reminder_preferences", "executed", {
            confirmation: "not_required",
            summary: reply,
          }),
          reply,
          state: emptyAgentState(),
        };
      } catch (error) {
        return makeWriteFailureResult({
          action: "update_reminder_preferences",
          error,
          reply: "Não consegui atualizar seus lembretes agora. Tente novamente em instantes.",
          state,
          summary: "Falha ao atualizar preferências de lembrete.",
        });
      }
    }

    return {
      actionTrace: makeActionTrace("update_reminder_preferences", "collecting", {
        summary: "Coletando ativação ou desativação dos lembretes.",
      }),
      reply: "Você quer ativar ou desativar os lembretes?",
      state,
    };
  }

  if (pendingAction === "edit_transaction") {
    const editDraft = {
      ...(state.editDraft ?? {}),
      ...inferEditFieldsFromAnswer(message, state.missingFields ?? []),
    };

    return handleTransactionEditTurn({
      context,
      editDraft,
      existingTarget: state.editTarget,
      missingFields: getMissingEditFieldsForDraft(state.missingFields ?? [], editDraft),
      targetKind: getTargetKindFromState(state),
    });
  }

  if (pendingAction !== "register_income" && pendingAction !== "register_expense") {
    return {
      reply: "Vamos recomeçar. Me diga o que você quer fazer no FechouMEI.",
      state: emptyAgentState(),
    };
  }

  const type = pendingAction === "register_income" ? "entrada" : "despesa";
  const deterministicFields = inferPartialFieldAnswer({
    message,
    missingFields: state.missingFields ?? [],
  });
  const deterministicDraft = {
    ...(state.draft ?? {}),
    ...deterministicFields,
  };

  if (Object.keys(deterministicFields).length > 0) {
    return handleMovementRegistrationTurn({
      context,
      draft: deterministicDraft,
      sourceMessage: message,
      type,
    });
  }

  if (isQuestionLikeDuringDraft(message)) {
    return {
      reply: getDraftPreservedQuestionReply(type, state),
      state,
    };
  }

  const interpretation = await safeGeminiInterpretation(message, state);

  if (!interpretation) {
    return {
      reply: "Tive uma instabilidade agora para processar sua mensagem. Seu rascunho continua salvo.",
      state,
    };
  }

  const mergedDraft = {
    ...(state.draft ?? {}),
    ...(interpretation.fields ?? {}),
  };
  const locallyMergedDraft = mergeDraftWithPlainAnswer(mergedDraft, message, state.missingFields);

  return handleMovementRegistrationTurn({
    confidence: interpretation.confidence,
    context,
    draft: applyLocalExtraction(message, locallyMergedDraft, type),
    sourceMessage: message,
    type,
  });
}

function handleAwaitingConfirmationFallback(state: AgentConversationState): AgentTurnResult {
  if (state.expectedResponseKind === "choose_cancel_or_continue") {
    return {
      reply: "Me diga se você quer cancelar o rascunho atual ou continuar com ele.",
      state,
    };
  }

  if (state.pendingAction === "delete_transaction") {
    return {
      reply: "Pode responder 'sim' para excluir ou 'cancelar' para manter.",
      state,
    };
  }

  if (state.pendingAction === "register_movements_batch") {
    return {
      reply: "Tenho esse lote pronto. Responda 'sim' para salvar, 'cancelar' para descartar ou mande uma correção curta.",
      state,
    };
  }

  return {
    reply: "Tenho um rascunho aqui. Responda 'sim' para salvar, 'cancelar' para descartar ou faça uma pergunta sem perder o rascunho.",
    state,
  };
}

async function handleMovementBatchTurn({
  combinedDraft,
  context,
  drafts,
  readAction,
}: {
  combinedDraft?: AgentMovementDraft;
  context: AgentExecutionContext;
  drafts: AgentMovementDraft[];
  readAction?: AgentActionId;
}): Promise<AgentTurnResult> {
  const normalizedBatch = normalizeMovementBatchDrafts(drafts);

  if (normalizedBatch.length === 0) {
    return {
      reply: "Não entendi movimentações suficientes para registrar. Pode me mandar de novo em uma frase mais direta?",
      state: emptyAgentState(),
    };
  }

  if (shouldCollectBatchAmounts(normalizedBatch)) {
    return {
      actionTrace: makeActionTrace("register_movements_batch", "collecting", {
        summary: "Coletando os valores dos itens do lote.",
      }),
      reply: getBatchAmountCollectionQuestion(normalizedBatch),
      state: makeAgentState({
        draft: combinedDraft,
        expectedResponseKind: "missing_amount",
        movementBatch: normalizedBatch,
        missingFields: ["amount"],
        pendingAction: "register_movements_batch",
        status: "collecting",
      }),
    };
  }

  const missingBatch = getFirstBatchMissingFields(normalizedBatch);

  if (missingBatch) {
    return {
      actionTrace: makeActionTrace("register_movements_batch", "collecting", {
        summary: "Lote de movimentações incompleto; nada foi gravado.",
      }),
      reply: `${getBatchMissingFieldsReply(missingBatch.index, missingBatch.draft, missingBatch.missingFields)} Não gravei nada ainda.`,
      state: makeAgentState({
        expectedResponseKind: getExpectedResponseKindForMissingFields(missingBatch.missingFields),
        movementBatch: normalizedBatch,
        missingFields: missingBatch.missingFields,
        pendingAction: "register_movements_batch",
        status: "collecting",
      }),
    };
  }

  const readReply = readAction ? await executeReadAction(context, readAction) : null;
  const confirmationReply = getMovementBatchConfirmationReply(normalizedBatch);

  return {
    actionTrace: makeActionTrace("register_movements_batch", "confirmation_requested", {
      confirmation: "requested",
      summary: `Confirmação solicitada para registrar ${normalizedBatch.length} movimentação(ões).`,
    }),
    reply: readReply ? `${readReply}\n\n${confirmationReply}` : confirmationReply,
    state: makeAgentState({
      expectedResponseKind: "confirm_save",
      movementBatch: normalizedBatch,
      missingFields: [],
      pendingAction: "register_movements_batch",
      status: "awaiting_confirmation",
    }),
  };
}

async function handleMovementRegistrationTurn({
  confidence,
  context,
  draft,
  skipCompoundSplit = false,
  sourceMessage,
  type,
}: {
  confidence?: "high" | "medium" | "low";
  context: AgentExecutionContext;
  draft: AgentMovementDraft;
  skipCompoundSplit?: boolean;
  sourceMessage?: string;
  type: MovementType;
}): Promise<AgentTurnResult> {
  void confidence;
  const action = type === "entrada" ? "register_income" : "register_expense";
  const cleanedDraft = {
    ...draft,
    category: normalizeDraftCategory(draft.category),
    description: draft.description ? cleanTransactionDescription(draft.description, type) : draft.description,
  };
  const normalizedDraft = normalizeMovementDraft(cleanedDraft, type, toDateInputValue(new Date()));

  if (!normalizedDraft.category && normalizedDraft.description) {
    const inferredCategory = inferCategoryFromDescription(normalizedDraft.description, type);

    if (inferredCategory && inferredCategory.confidence !== "low") {
      normalizedDraft.category = inferredCategory.category;
    }
  }

  if (normalizedDraft.description && normalizedDraft.category) {
    normalizedDraft.description = cleanDescriptionUsingResolvedCategory(
      normalizedDraft.description,
      normalizedDraft.category,
    );
  }

  if (!skipCompoundSplit) {
    const compoundExpenseHandling = buildCompoundExpenseHandling({
      draft: normalizedDraft,
      sourceMessage,
      type,
    });

    if (compoundExpenseHandling?.kind === "batch") {
      return handleMovementBatchTurn({
        combinedDraft: compoundExpenseHandling.combinedDraft,
        context,
        drafts: compoundExpenseHandling.batch,
      });
    }

    if (compoundExpenseHandling?.kind === "choose_split_or_combined") {
      return {
        actionTrace: makeActionTrace("register_movements_batch", "collecting", {
          summary: "Escolhendo entre lançamento junto ou separado.",
        }),
        reply: compoundExpenseHandling.reply,
        state: makeAgentState({
          draft: compoundExpenseHandling.combinedDraft,
          expectedResponseKind: "choose_split_or_combined",
          movementBatch: compoundExpenseHandling.batch,
          missingFields: ["amount"],
          pendingAction: "register_movements_batch",
          status: "collecting",
        }),
      };
    }
  }

  const missingFields = getPracticalMissingFields(normalizedDraft);

  if (missingFields.length > 0) {
    return {
      actionTrace: makeActionTrace(action, "collecting", {
        summary: `Coletando dados para registrar ${type}.`,
      }),
      reply: getRegistrationMissingFieldsQuestion(type, normalizedDraft, missingFields),
      state: makeAgentState({
        draft: normalizedDraft,
        expectedResponseKind: getExpectedResponseKindForMissingFields(missingFields),
        missingFields,
        pendingAction: action,
        status: "collecting",
      }),
    };
  }

  return {
    actionTrace: makeActionTrace(action, "confirmation_requested", {
      confirmation: "requested",
      summary: `Confirmação solicitada para registrar ${type}.`,
    }),
    reply: getSingleMovementConfirmationReply(normalizedDraft),
    state: makeAgentState({
      draft: normalizedDraft,
      expectedResponseKind: "confirm_save",
      missingFields: [],
      pendingAction: action,
      status: "awaiting_confirmation",
    }),
  };
}

async function handleMovementBatchAmountTurn({
  context,
  message,
  state,
}: {
  context: AgentExecutionContext;
  message: string;
  state: AgentConversationState;
}): Promise<AgentTurnResult> {
  const batch = normalizeMovementBatchDrafts(state.movementBatch ?? []);
  const amounts = extractAmountsFromText(message);
  const pendingIndexes = getPendingBatchAmountIndexes(batch);

  if (amounts.length === 0 || pendingIndexes.length === 0) {
    return {
      reply: getBatchAmountCollectionQuestion(batch),
      state,
    };
  }

  if (pendingIndexes.length === 1) {
    if (amounts.length !== 1) {
      return {
        reply: getBatchAmountMismatchReply(batch, pendingIndexes.length, amounts.length),
        state,
      };
    }

    const nextBatch = applyAmountsToBatch(batch, pendingIndexes, amounts.slice(0, 1));
    return handleMovementBatchTurn({
      context,
      drafts: nextBatch,
    });
  }

  if (amounts.length === pendingIndexes.length) {
    const nextBatch = applyAmountsToBatch(batch, pendingIndexes, amounts);
    return handleMovementBatchTurn({
      context,
      drafts: nextBatch,
    });
  }

  if (amounts.length === 1) {
    const combinedDraft = buildCombinedDraftFromBatch(batch, amounts[0]);
    return {
      actionTrace: makeActionTrace("register_movements_batch", "collecting", {
        summary: "Confirmando se o valor é total do lote ou por item.",
      }),
      reply: `Esse ${toCurrency(amounts[0])} é o total de ${formatBatchItemLabels(batch)} ou você quer lançar separado?`,
      state: makeAgentState({
        draft: combinedDraft,
        expectedResponseKind: "choose_split_or_combined",
        movementBatch: batch,
        missingFields: ["amount"],
        pendingAction: "register_movements_batch",
        status: "collecting",
      }),
    };
  }

  return {
    reply: getBatchAmountMismatchReply(batch, pendingIndexes.length, amounts.length),
    state,
  };
}

async function handleSplitOrCombinedChoiceTurn({
  choice,
  context,
  state,
}: {
  choice: SplitOrCombinedChoice;
  context: AgentExecutionContext;
  state: AgentConversationState;
}): Promise<AgentTurnResult> {
  if (choice === "split") {
    return handleMovementBatchTurn({
      context,
      drafts: state.movementBatch ?? [],
    });
  }

  if (state.draft?.type !== "despesa" && state.draft?.type !== "entrada") {
    return {
      reply: "Me diga se quer lançar junto ou separado.",
      state,
    };
  }

  return handleMovementRegistrationTurn({
    context,
    draft: state.draft,
    skipCompoundSplit: true,
    type: state.draft.type,
  });
}

async function executeConfirmedMovementBatch(
  context: AgentExecutionContext,
  normalizedBatch: Array<Required<AgentMovementDraft>>,
  state: AgentConversationState,
): Promise<AgentTurnResult> {
  try {
    const result = await executeMovementBatchRegistration(context, normalizedBatch);

    return {
      actionTrace: makeActionTrace("register_movements_batch", "executed", {
        confirmation: "confirmed",
        summary: result.reply,
      }),
      reply: result.reply,
      state: makeIdleStateWithLastWrites(result.movements),
    };
  } catch (error) {
    return makeWriteFailureResult({
      action: "register_movements_batch",
      confirmation: "confirmed",
      error,
      reply: "Não consegui salvar essas movimentações agora. Nada foi confirmado.",
      state,
      summary: "Falha ao registrar lote de movimentações.",
    });
  }
}

function normalizeMovementBatchDrafts(drafts: AgentMovementDraft[]) {
  return drafts
    .map((draft) => {
      if (draft.type !== "entrada" && draft.type !== "despesa") {
        return null;
      }

      return normalizeRegistrationDraft(draft, draft.type);
    })
    .filter((draft): draft is AgentMovementDraft => Boolean(draft));
}

function normalizeRegistrationDraft(draft: AgentMovementDraft, type: MovementType) {
  const cleanedDraft = {
    ...draft,
    category: normalizeDraftCategory(draft.category),
    description: draft.description ? cleanTransactionDescription(draft.description, type) : draft.description,
  };
  const normalizedDraft = normalizeMovementDraft(cleanedDraft, type, toDateInputValue(new Date()));

  if (!normalizedDraft.category && normalizedDraft.description) {
    const inferredCategory = inferCategoryFromDescription(normalizedDraft.description, type);

    if (inferredCategory && inferredCategory.confidence !== "low") {
      normalizedDraft.category = inferredCategory.category;
    }
  }

  if (normalizedDraft.description && normalizedDraft.category) {
    normalizedDraft.description = cleanDescriptionUsingResolvedCategory(
      normalizedDraft.description,
      normalizedDraft.category,
    );
  }

  return normalizedDraft;
}

function getFirstBatchMissingFields(batch: AgentMovementDraft[]) {
  for (const [index, draft] of batch.entries()) {
    const missingFields = getPracticalMissingFields(draft);

    if (missingFields.length > 0) {
      return { draft, index, missingFields };
    }
  }

  return null;
}

function shouldCollectBatchAmounts(batch: AgentMovementDraft[]) {
  return batch.length > 1 && batch.every((draft) => {
    const missingFields = getPracticalMissingFields(draft);
    return missingFields.length === 1 && missingFields[0] === "amount";
  });
}

function getBatchAmountCollectionQuestion(batch: AgentMovementDraft[]) {
  return `Me passe os valores separados de ${formatBatchItemLabels(batch)}.`;
}

function getBatchAmountMismatchReply(batch: AgentMovementDraft[], expectedCount: number, receivedCount: number) {
  if (expectedCount === 1) {
    return `Falta só 1 valor para ${formatBatchItemLabels(getPendingBatchItems(batch))}. Me mande um valor só.`;
  }

  return `Entendi ${receivedCount} valores para ${expectedCount} itens. Me mande um valor para cada item, na ordem: ${formatBatchItemLabels(getPendingBatchItems(batch))}.`;
}

function getRegistrationMissingFieldsQuestion(
  type: MovementType,
  draft: AgentMovementDraft,
  missingFields: MovementField[],
) {
  if (missingFields.length === 1 && missingFields[0] === "description" && draft.amount) {
    return type === "entrada"
      ? `Esses ${toCurrency(draft.amount)} entraram de quê?`
      : `Essa despesa de ${toCurrency(draft.amount)} foi de quê?`;
  }

  if (missingFields.length === 1 && missingFields[0] === "category" && draft.description) {
    return "Você quer colocar em qual categoria?";
  }

  return getMissingFieldsQuestion(type, missingFields);
}

function getDraftPreservedQuestionReply(type: MovementType, state: AgentConversationState) {
  const missingFields = state.missingFields ?? getPracticalMissingFields(state.draft ?? {});

  if (missingFields.length === 0) {
    return "Seu rascunho continua salvo. Responda 'sim' para salvar ou 'cancelar' para descartar.";
  }

  const question = getRegistrationMissingFieldsQuestion(type, state.draft ?? {}, missingFields);
  return `Seu rascunho continua salvo. Para continuar, ${lowercaseFirst(question)}`;
}

function lowercaseFirst(value: string) {
  return value.replace(/^./, (letter) => letter.toLocaleLowerCase("pt-BR"));
}

function getBatchMissingFieldsReply(index: number, draft: AgentMovementDraft, missingFields: MovementField[]) {
  const type = draft.type ?? "despesa";
  return `No item ${index + 1}, ${getRegistrationMissingFieldsQuestion(type, draft, missingFields).replace(/^./, (letter) => letter.toLowerCase())}`;
}

function getMovementBatchConfirmationReply(batch: AgentMovementDraft[]) {
  if (batch.length === 1) {
    return getSingleMovementConfirmationReply(batch[0]);
  }

  const items = batch.map((draft, index) => `${index + 1}. ${formatMovementDraftSummary(draft)}`);
  return `Confiro assim:\n${items.join("\n")}\nPosso salvar?`;
}

function getSingleMovementConfirmationReply(draft: AgentMovementDraft) {
  return `Confiro assim: ${formatMovementDraftSummary(draft)}. Posso salvar?`;
}

function formatMovementDraftSummary(draft: AgentMovementDraft) {
  const typeLabel = draft.type === "entrada" ? "uma entrada" : "uma despesa";
  const connector = draft.type === "entrada" ? "de" : "com";
  const date = draft.occurred_on && formatDateLabel(draft.occurred_on) !== "hoje"
    ? ` em ${formatDateLabel(draft.occurred_on)}`
    : "";

  return `${typeLabel} de ${toCurrency(draft.amount ?? 0)} ${connector} ${draft.description}${date}`;
}

function buildCompoundExpenseHandling({
  draft,
  sourceMessage,
  type,
}: {
  draft: AgentMovementDraft;
  sourceMessage?: string;
  type: MovementType;
}): CompoundExpenseHandling | null {
  if (type !== "despesa" || !draft.description) {
    return null;
  }

  const descriptions = splitCompoundExpenseDescription(draft.description);

  if (descriptions.length < 2) {
    return null;
  }

  const batch = descriptions.map((description) =>
    normalizeRegistrationDraft(
      {
        ...draft,
        amount: undefined,
        category: undefined,
        description,
      },
      type,
    ),
  );
  const amounts = extractAmountsFromText(sourceMessage ?? "");

  if (amounts.length === batch.length) {
    return {
      batch: applyAmountsToBatch(batch, getPendingBatchAmountIndexes(batch), amounts),
      combinedDraft: buildCombinedDraftFromBatch(batch, amounts.reduce((sum, amount) => sum + amount, 0)),
      kind: "batch",
    };
  }

  if (typeof draft.amount === "number" && draft.amount > 0) {
    return {
      batch,
      combinedDraft: buildCombinedDraftFromBatch(batch, draft.amount),
      kind: "choose_split_or_combined",
      reply: `Vi ${formatBatchItemLabels(batch)}. Esse ${toCurrency(draft.amount)} foi o total de tudo ou você quer lançar separado?`,
    };
  }

  return {
    batch,
    combinedDraft: buildCombinedDraftFromBatch(batch),
    kind: "batch",
  };
}

function splitCompoundExpenseDescription(description: string) {
  return description
    .replace(/\s+(?:,?\s*e|mais)\s+/gi, "|")
    .split(/\s*[|;,]\s*/)
    .map((item) => item.trim())
    .filter((item, index, items) => item.length >= 2 && items.indexOf(item) === index);
}

function extractAmountsFromText(message: string) {
  const sanitizedMessage = message.replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, " ");
  const matches = sanitizedMessage.matchAll(/(?:r\$\s*)?((?:\d{1,3}(?:\.\d{3})+)|\d+)(?:[,.](\d{1,2}))?/gi);
  const amounts: number[] = [];

  for (const match of matches) {
    const integerPart = match[1]?.replace(/\./g, "") ?? "";
    const decimalPart = match[2] ? match[2].padEnd(2, "0") : "00";
    const amount = Number(`${integerPart}.${decimalPart}`);

    if (Number.isFinite(amount) && amount > 0) {
      amounts.push(amount);
    }
  }

  return amounts;
}

function getPendingBatchAmountIndexes(batch: AgentMovementDraft[]) {
  return batch.flatMap((draft, index) => {
    const missingFields = getPracticalMissingFields(draft);
    return missingFields.length === 1 && missingFields[0] === "amount" ? [index] : [];
  });
}

function getPendingBatchItems(batch: AgentMovementDraft[]) {
  const pendingIndexes = new Set(getPendingBatchAmountIndexes(batch));
  return batch.filter((_, index) => pendingIndexes.has(index));
}

function applyAmountsToBatch(batch: AgentMovementDraft[], pendingIndexes: number[], amounts: number[]) {
  const assignedAmounts = new Map<number, number>();

  pendingIndexes.forEach((index, amountIndex) => {
    const amount = amounts[amountIndex];

    if (typeof amount === "number") {
      assignedAmounts.set(index, amount);
    }
  });

  return batch.map((draft, index) => {
    const amount = assignedAmounts.get(index);

    if (typeof amount !== "number") {
      return draft;
    }

    return {
      ...draft,
      amount,
    };
  });
}

function buildCombinedDraftFromBatch(batch: AgentMovementDraft[], amount?: number) {
  const occurredOn = batch[0]?.occurred_on ?? toDateInputValue(new Date());
  const uniqueCategories = [...new Set(batch.map((draft) => draft.category).filter(Boolean))];

  return normalizeRegistrationDraft(
    {
      amount,
      category: uniqueCategories.length === 1 ? uniqueCategories[0] : undefined,
      description: joinLabelsWithE(batch.map((draft) => draft.description ?? "").filter(Boolean)),
      occurred_on: occurredOn,
      type: "despesa",
    },
    "despesa",
  );
}

function formatBatchItemLabels(batch: AgentMovementDraft[]) {
  return joinLabelsWithE(batch.map((draft) => draft.description ?? "").filter(Boolean));
}

function joinLabelsWithE(labels: string[]) {
  if (labels.length <= 1) {
    return labels[0] ?? "esses itens";
  }

  if (labels.length === 2) {
    return `${labels[0]} e ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(", ")} e ${labels.at(-1)}`;
}

function detectSplitOrCombinedChoice(message: string): SplitOrCombinedChoice | null {
  const normalized = normalizeChoiceText(message);

  if (/\b(separad[oa]s?|separa|por item|cada item|um por um)\b/.test(normalized)) {
    return "split";
  }

  if (/\b(junt[oa]s?|junto|tudo junto|valor total|total|consolidado|um valor so|um so)\b/.test(normalized)) {
    return "combined";
  }

  return null;
}

function applyMovementBatchCorrection(batch: AgentMovementDraft[], message: string) {
  const correction = inferCorrectionFields(message);
  const replacement = inferDescriptionReplacement(message);

  if (Object.keys(correction).length === 0) {
    return null;
  }

  const targetIndex = pickMovementDraftIndexForCorrection(batch, message, correction);

  if (targetIndex < 0) {
    return null;
  }

  return batch.map((draft, index) => {
    if (index !== targetIndex) {
      return draft;
    }

    return {
      ...draft,
      ...correction,
      description: replacement?.to ?? correction.description ?? draft.description,
      type: correction.type ?? draft.type,
    };
  });
}

function pickMovementDraftIndexForCorrection(
  batch: AgentMovementDraft[],
  message: string,
  correction: Partial<AgentMovementDraft>,
) {
  const replacement = inferDescriptionReplacement(message);

  if (replacement?.from) {
    const normalizedFrom = normalizeComparableText(replacement.from);
    const matchedIndex = batch.findIndex((draft) =>
      normalizeComparableText(draft.description ?? "").includes(normalizedFrom),
    );

    if (matchedIndex >= 0) {
      return matchedIndex;
    }
  }

  if (correction.type) {
    const matchedIndex = batch.findIndex((draft) => draft.type === correction.type);

    if (matchedIndex >= 0) {
      return matchedIndex;
    }
  }

  return batch.length - 1;
}

function pickRecentWriteForCorrection(
  state: AgentConversationState,
  message: string,
  correction: AgentTransactionEditDraft,
) {
  const writes = state.lastWrites?.length
    ? state.lastWrites
    : state.lastWrite
      ? [state.lastWrite]
      : [];
  const replacement = inferDescriptionReplacement(message);

  if (writes.length === 0 || Object.keys(correction).length === 0) {
    return null;
  }

  if (replacement?.from) {
    const normalizedFrom = normalizeComparableText(replacement.from);
    const matchedWrite = writes.find((write) =>
      normalizeComparableText(write.target.description).includes(normalizedFrom),
    );

    if (matchedWrite) {
      return matchedWrite;
    }
  }

  return writes[writes.length - 1];
}

function normalizeComparableText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function isCorrectionLikeMessage(message: string) {
  return Object.keys(inferCorrectionFields(message)).length > 0;
}

async function handleTransactionEditTurn({
  context,
  editDraft,
  existingTarget,
  missingFields,
  targetKind,
}: {
  context: AgentExecutionContext;
  editDraft: AgentTransactionEditDraft;
  existingTarget?: AgentConversationState["editTarget"];
  missingFields: MovementField[];
  targetKind: TransactionTargetKind;
}): Promise<AgentTurnResult> {
  const target = existingTarget ?? await getLatestMovement(context, targetKind);

  if (!target) {
    return {
      reply: getMissingEditTargetReply(targetKind),
      state: emptyAgentState(),
    };
  }

  if (missingFields.length > 0) {
    return {
      actionTrace: makeActionTrace("edit_transaction", "collecting", {
        summary: "Coletando o que mudar na movimentação.",
      }),
      reply: getEditMissingFieldsQuestion(missingFields),
      state: makeAgentState({
        editDraft,
        editTarget: target,
        expectedResponseKind: getExpectedResponseKindForMissingFields(missingFields),
        missingFields,
        pendingAction: "edit_transaction",
        status: "collecting",
      }),
    };
  }

  const normalizedEdit = normalizeTransactionEditDraft(editDraft);
  try {
    const result = await executeTransactionEdit(context, target, normalizedEdit, targetKind);

    return {
      actionTrace: makeActionTrace("edit_transaction", "executed", {
        confirmation: "not_required",
        summary: result.reply,
      }),
      reply: result.reply,
      state: makeIdleStateWithLastWrite("edit_transaction", result.movement, targetKind),
    };
  } catch (error) {
    return makeWriteFailureResult({
      action: "edit_transaction",
      confirmation: "not_required",
      error,
      reply: "Não consegui atualizar essa movimentação agora. Tente novamente em instantes.",
      summary: "Falha ao editar a movimentação.",
    });
  }
}

function normalizeDraftCategory(category?: string) {
  const canonicalCategory = canonicalizeCategoryInput(category);
  return canonicalCategory && canonicalCategory.confidence !== "low" ? canonicalCategory.category : category;
}

function normalizeTransactionEditDraft(editDraft: AgentTransactionEditDraft): AgentTransactionEditDraft {
  return {
    ...editDraft,
    category: normalizeDraftCategory(editDraft.category),
    description: editDraft.description?.trim(),
    occurred_on: /^\d{4}-\d{2}-\d{2}$/.test(editDraft.occurred_on ?? "") ? editDraft.occurred_on : undefined,
  };
}

function inferEditFieldsFromAnswer(message: string, missingFields: MovementField[]): AgentTransactionEditDraft {
  const inferred = inferPartialFieldAnswer({
    message,
    missingFields,
  });

  return {
    amount: inferred.amount,
    category: inferred.category,
    description: inferred.description,
    occurred_on: inferred.occurred_on,
  };
}

function getMissingEditFieldsForDraft(
  previousMissingFields: MovementField[],
  editDraft: AgentTransactionEditDraft,
): MovementField[] {
  if (Object.keys(editDraft).length > 0) {
    return [];
  }

  const allowed = previousMissingFields.filter((field) =>
    field === "amount" || field === "description" || field === "category" || field === "occurred_on",
  );
  return allowed.length > 0 ? allowed : ["amount", "description", "category"];
}

function getEditMissingFieldsQuestion(missingFields: MovementField[]) {
  if (missingFields.length === 1 && missingFields[0] === "amount") {
    return "Qual é o novo valor?";
  }

  if (missingFields.length === 1 && missingFields[0] === "description") {
    return "Qual é a nova descrição?";
  }

  if (missingFields.length === 1 && missingFields[0] === "category") {
    return "Qual é a nova categoria?";
  }

  if (missingFields.length === 1 && missingFields[0] === "occurred_on") {
    return "Qual é a nova data?";
  }

  return "O que você quer mudar: valor, descrição, categoria ou data?";
}

function getMissingEditTargetReply(targetKind: TransactionTargetKind) {
  if (targetKind === "latest_expense") {
    return "Não encontrei despesas para editar.";
  }

  if (targetKind === "latest_income") {
    return "Não encontrei entradas para editar.";
  }

  return "Não encontrei movimentações para editar.";
}

async function handleDeleteRequest(context: AgentExecutionContext): Promise<AgentTurnResult> {
  const latestMovement = await getLatestMovementForDeletion(context);

  if (!latestMovement) {
    return {
      reply: "Não encontrei movimentações para excluir.",
      state: emptyAgentState(),
    };
  }

  return {
    actionTrace: makeActionTrace("delete_transaction", "confirmation_requested", {
      confirmation: "requested",
      summary: `Confirmação solicitada para excluir ${formatMovementForDeletion(latestMovement)}.`,
    }),
    reply: `Encontrei como última movimentação ${formatMovementForDeletion(latestMovement)}. Deseja excluir mesmo?`,
    state: makeAgentState({
      deleteTarget: latestMovement,
      expectedResponseKind: "confirm_delete",
      missingFields: [],
      pendingAction: "delete_transaction",
      status: "awaiting_confirmation",
    }),
  };
}

async function safeGeminiInterpretation(message: string, state: AgentConversationState) {
  try {
    return await interpretMessageWithGemini({ message, state });
  } catch (error) {
    if (error instanceof GeminiConfigurationError || error instanceof GeminiProviderError) {
      throw error;
    }

    console.error("Agent Gemini interpretation failed", error);
    throw new GeminiProviderError("Tive uma instabilidade agora para processar sua mensagem. Tente novamente em instantes.");
  }
}

function applyLocalExtraction(message: string, draft: AgentMovementDraft, type: MovementType): AgentMovementDraft {
  const parsed = parseTransactionMessage(message, type);
  const next: AgentMovementDraft = {
    ...(parsed?.draft ?? {}),
    ...draft,
    type,
  };

  if (!next.amount) {
    const amount = parseAmountFromText(message);

    if (amount) {
      next.amount = amount;
    }
  }

  if (!next.description && parsed?.draft.description) {
    next.description = parsed.draft.description;
  }

  if (!next.category && parsed?.draft.category) {
    next.category = parsed.draft.category;
  }

  if (!next.occurred_on && parsed?.draft.occurred_on) {
    next.occurred_on = parsed.draft.occurred_on;
  }

  return next;
}

function getPlannedActionReply(actionId: AgentActionId) {
  const action = getActionDefinition(actionId);

  if (!action) {
    return "Ainda não consigo fazer isso por aqui.";
  }

  return `Ainda não consigo ${action.label.toLowerCase()} por aqui. Nesta fase, já consigo registrar movimentações, consultar resumo, limite, obrigações e registros recentes.`;
}

async function executeReadActions(context: AgentExecutionContext, actions: AgentActionId[]) {
  const replies: string[] = [];

  for (const action of actions) {
    replies.push(await executeReadAction(context, action));
  }

  return replies.join("\n\n");
}

function appendResumeHint(reply: string, state: AgentConversationState) {
  if (state.status === "idle") {
    return reply;
  }

  if (state.pendingAction === "delete_transaction") {
    return `${reply} A exclusão continua pendente; responda "sim" para excluir ou "cancelar" para manter.`;
  }

  if (state.pendingAction === "edit_transaction") {
    return `${reply} A edição pendente continua salva para retomarmos depois.`;
  }

  if (state.pendingAction === "register_income" || state.pendingAction === "register_expense") {
    return `${reply} Seu rascunho continua salvo para retomarmos depois.`;
  }

  if (state.pendingAction === "register_movements_batch") {
    return `${reply} O lote pendente continua salvo para retomarmos depois.`;
  }

  return `${reply} A ação pendente continua salva para retomarmos depois.`;
}

function makeActionTrace(
  action: AgentActionId,
  status: AgentActionTrace["status"],
  options: Omit<AgentActionTrace, "action" | "status"> = {},
): AgentActionTrace {
  return {
    action,
    status,
    ...options,
  };
}

function getCancellationTrace(state: AgentConversationState) {
  if (!state.pendingAction || !isWriteAction(state.pendingAction)) {
    return undefined;
  }

  return makeActionTrace(state.pendingAction, "cancelled", {
    confirmation: "cancelled",
    summary: "Ação pendente cancelada pelo usuário.",
  });
}

function getFailureTrace(state: AgentConversationState, error: string) {
  if (!state.pendingAction || !isWriteAction(state.pendingAction)) {
    return undefined;
  }

  return makeActionTrace(state.pendingAction, "failed", {
    error,
    summary: "Falha ao processar ação pendente.",
  });
}

function makeWriteFailureResult({
  action,
  confirmation,
  error,
  reply,
  state,
  summary,
}: {
  action: AgentActionId;
  confirmation?: AgentActionTrace["confirmation"];
  error: unknown;
  reply: string;
  state?: AgentConversationState;
  summary: string;
}): AgentTurnResult {
  console.error("Agent write action failed", {
    action,
    error,
  });

  return {
    actionTrace: makeActionTrace(action, "failed", {
      confirmation,
      error: getErrorSummary(error),
      summary,
    }),
    reply,
    state: state ?? emptyAgentState(),
  };
}

function getErrorSummary(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 240) : "Erro inesperado.";
}

function getTargetKindFromState(state: AgentConversationState): TransactionTargetKind {
  if (state.editTarget?.type === "entrada") {
    return "latest_income";
  }

  if (state.editTarget?.type === "despesa") {
    return "latest_expense";
  }

  return "latest";
}

function makeIdleStateWithLastWrite(
  action: AgentLastWriteContext["action"],
  target: AgentDeleteTarget,
  targetKind: TransactionTargetKind = getTargetKindForMovement(target),
) {
  const lastWrite: AgentLastWriteContext = {
    action,
    target,
    targetKind,
    updatedAt: new Date().toISOString(),
  };

  return makeAgentState({
    lastWrite,
    lastWrites: [lastWrite],
    status: "idle",
  });
}

function makeIdleStateWithLastWrites(targets: AgentDeleteTarget[]) {
  const updatedAt = new Date().toISOString();
  const lastWrites = targets.map<AgentLastWriteContext>((target) => ({
    action: target.type === "entrada" ? "register_income" : "register_expense",
    target,
    targetKind: getTargetKindForMovement(target),
    updatedAt,
  }));

  return makeAgentState({
    lastWrite: lastWrites.at(-1),
    lastWrites,
    status: "idle",
  });
}

function getTargetKindForMovement(target: AgentDeleteTarget): TransactionTargetKind {
  return target.type === "entrada" ? "latest_income" : "latest_expense";
}

function withExpectedResponseKind(
  state: AgentConversationState,
  expectedResponseKind: AgentExpectedResponseKind,
): AgentConversationState {
  return {
    ...state,
    expectedResponseKind,
    updatedAt: new Date().toISOString(),
  };
}

function handleExpectedChoiceResponse(message: string, state: AgentConversationState): AgentTurnResult | null {
  if (state.expectedResponseKind !== "choose_cancel_or_continue") {
    return null;
  }

  const normalized = normalizeChoiceText(message);

  if (/^(continuar|continua|continue|seguir|segue|mantem|mantém|manter|continua com esse|continua o atual)\b/.test(normalized)) {
    return {
      reply: "Certo, mantive o rascunho atual. Podemos continuar de onde parou.",
      state: restoreExpectedResponseKind(state),
    };
  }

  return null;
}

function restoreExpectedResponseKind(state: AgentConversationState): AgentConversationState {
  const expectedResponseKind = getExpectedResponseKindFromState(state);

  return {
    ...state,
    expectedResponseKind,
    updatedAt: new Date().toISOString(),
  };
}

function getExpectedResponseKindFromState(state: AgentConversationState): AgentExpectedResponseKind | undefined {
  if (state.pendingAction === "delete_transaction" && state.status === "awaiting_confirmation") {
    return "confirm_delete";
  }

  if (state.status === "collecting" && state.expectedResponseKind === "choose_split_or_combined") {
    return "choose_split_or_combined";
  }

  if (
    (state.pendingAction === "register_income" ||
      state.pendingAction === "register_expense" ||
      state.pendingAction === "register_movements_batch") &&
    state.status === "awaiting_confirmation"
  ) {
    return "confirm_save";
  }

  if (state.status === "collecting") {
    return getExpectedResponseKindForMissingFields(state.missingFields ?? []);
  }

  return undefined;
}

function getExpectedResponseKindForMissingFields(missingFields: MovementField[]): AgentExpectedResponseKind | undefined {
  const firstMissingField = missingFields[0];

  if (firstMissingField === "amount") {
    return "missing_amount";
  }

  if (firstMissingField === "category") {
    return "missing_category";
  }

  if (firstMissingField === "description") {
    return "missing_description";
  }

  if (firstMissingField === "occurred_on") {
    return "missing_date";
  }

  return undefined;
}

function normalizeChoiceText(message: string) {
  return message
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function normalizeConversationState(state?: AgentConversationState | null): AgentConversationState {
  if (!state || !["idle", "collecting", "awaiting_confirmation"].includes(state.status)) {
    return emptyAgentState();
  }

  return state;
}

function isMovementRegistrationAction(actionId: AgentActionId) {
  return actionId === "register_income" || actionId === "register_expense";
}

function isQuestionLikeDuringDraft(message: string) {
  const normalized = message
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{Letter}\p{Number}\s?]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = normalized.split(/\s+/).filter(Boolean);

  return (
    /^(qual|quais|como|quando|quanto|o que|por que|porque|tem|existe|existem|posso|pode)\b/.test(normalized) ||
    (message.includes("?") && words.length > 2)
  );
}

function isReadAction(actionId: AgentActionId) {
  return [
    "monthly_summary",
    "dashboard_overview",
    "yearly_revenue",
    "mei_limit",
    "obligations_status",
    "recent_transactions",
    "latest_transaction",
    "specific_movement_query",
    "reminder_preferences_status",
    "export_transactions",
    "profile_overview",
  ].includes(actionId);
}

function isWriteAction(actionId: AgentActionId) {
  return [
    "register_income",
    "register_expense",
    "register_movements_batch",
    "mark_obligation",
    "update_reminder_preferences",
    "set_initial_balance",
    "edit_transaction",
    "delete_transaction",
  ].includes(actionId);
}

function getPracticalMissingFields(draft: AgentMovementDraft): MovementField[] {
  return getReliableMovementMissingFields(draft);
}
