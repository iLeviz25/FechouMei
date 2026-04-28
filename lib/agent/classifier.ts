import type {
  AgentActionId,
  AgentConversationState,
  AgentMessageKind,
  AgentMovementDraft,
  AgentQuickPeriodQuery,
  AgentReminderPreferenceUpdate,
  AgentSpecificMovementQuery,
  AgentTransactionEditDraft,
  MovementField,
  TransactionTargetKind,
} from "@/lib/agent/types";
import {
  canonicalizeCategoryInput,
  extractExplicitDatePtBr,
  getOfficialMovementCategories,
  normalizeText,
  parseTransactionMessage,
  parseTransactionMessages,
} from "@/lib/agent/transaction-parser";
import { parseQuickPeriodQuery } from "@/lib/agent/period-queries";
import { parseSpecificMovementQuery } from "@/lib/agent/movement-queries";
import { normalizeSpokenAgentMessage } from "@/lib/agent/spoken-text";
import { detectConfirmation, parseAmountFromText, toCurrency } from "@/lib/agent/utils";

export type DeterministicClassification = {
  action?: AgentActionId;
  confidence?: "high" | "medium" | "low";
  draft?: AgentMovementDraft;
  drafts?: AgentMovementDraft[];
  editDraft?: AgentTransactionEditDraft;
  initialBalanceAmount?: number;
  kind: AgentMessageKind;
  missingFields?: MovementField[];
  obligationKey?: string;
  periodQuery?: AgentQuickPeriodQuery;
  readAction?: AgentActionId;
  readActions?: AgentActionId[];
  reply?: string;
  reminderUpdate?: AgentReminderPreferenceUpdate;
  specificMovementQuery?: AgentSpecificMovementQuery;
  transactionTarget?: TransactionTargetKind;
};

export function classifyDeterministically(
  message: string,
  state: AgentConversationState,
): DeterministicClassification | null {
  const spokenMessage = normalizeSpokenAgentMessage(message);
  const normalized = normalizeText(spokenMessage);
  const rawNormalized = normalizeText(message);
  const confirmation = detectConfirmation(spokenMessage);

  if (state.status !== "idle" && isCorrection(normalized)) {
    return { kind: "correction" };
  }

  if (isCancelation(normalized)) {
    return { kind: "cancelation" };
  }

  if (state.status !== "idle" && confirmation !== "unclear") {
    return { kind: "confirmation" };
  }

  const deleteAction = getDeleteAction(normalized);

  if (deleteAction) {
    return {
      action: deleteAction,
      kind: state.status === "idle" ? "write_action" : "interruption",
    };
  }

  const editRequest = getTransactionEditRequest(spokenMessage, normalized);

  if (editRequest) {
    return {
      action: "edit_transaction",
      editDraft: editRequest.editDraft,
      kind: state.status === "idle" ? "write_action" : "interruption",
      missingFields: editRequest.missingFields,
      transactionTarget: editRequest.target,
    };
  }

  const latestTransactionTarget = getLatestTransactionTarget(normalized);

  const categoryCatalogReply = getCategoryCatalogReply(normalized);

  if (categoryCatalogReply) {
    return {
      kind: "product_question",
      reply: appendPendingContext(categoryCatalogReply, state),
    };
  }

  const specificMovementQuery = parseSpecificMovementQuery(spokenMessage);

  if (specificMovementQuery) {
    if (
      /(dessa categoria|desse categoria|da categoria|de categoria)/.test(normalized) &&
      !specificMovementQuery.category &&
      !specificMovementQuery.searchTerm
    ) {
      return {
        kind: "unsupported_or_unknown",
        reply: "Qual categoria você quer consultar?",
      };
    }

    return {
      action: "specific_movement_query",
      kind: state.status === "idle" ? "read_query" : "interruption",
      specificMovementQuery,
    };
  }

  if (latestTransactionTarget) {
    return {
      action: "latest_transaction",
      kind: state.status === "idle" ? "read_query" : "interruption",
      transactionTarget: latestTransactionTarget,
    };
  }

  if (isCapabilitiesQuestion(rawNormalized) || isCapabilitiesQuestion(normalized)) {
    return { kind: "capabilities" };
  }

  const safetyReply = getSafetyFiscalReply(rawNormalized);

  if (safetyReply) {
    return {
      kind: "product_question",
      reply: appendPendingContext(safetyReply, state),
    };
  }

  const identityReply = getAssistantIdentityReply(rawNormalized) ?? getAssistantIdentityReply(normalized);

  if (identityReply) {
    return {
      kind: "small_talk",
      reply: appendPendingContext(identityReply, state),
    };
  }

  if (isCorrection(normalized)) {
    return { kind: "correction" };
  }

  const markObligationKey = getMarkObligationKey(normalized);

  if (markObligationKey) {
    return {
      action: "mark_obligation",
      kind: state.status === "idle" ? "write_action" : "interruption",
      obligationKey: markObligationKey,
    };
  }

  if (isAmbiguousObligationCompletion(normalized)) {
    return {
      action: "mark_obligation",
      kind: state.status === "idle" ? "write_action" : "interruption",
    };
  }

  const reminderUpdate = getReminderUpdate(normalized);

  if (reminderUpdate) {
    return {
      action: "update_reminder_preferences",
      kind: state.status === "idle" ? "write_action" : "interruption",
      reminderUpdate,
    };
  }

  const initialBalanceUpdate = getInitialBalanceUpdate(spokenMessage, normalized);

  if (initialBalanceUpdate) {
    if (initialBalanceUpdate.amount !== null) {
      return {
        action: "set_initial_balance",
        initialBalanceAmount: initialBalanceUpdate.amount,
        kind: state.status === "idle" ? "write_action" : "interruption",
      };
    }

    return {
      kind: "unsupported_or_unknown",
      reply: "Qual valor você quer usar como saldo atual?",
    };
  }

  const periodQuery = parseQuickPeriodQuery(normalized);

  if (periodQuery) {
    return {
      action: "quick_period_query",
      kind: state.status === "idle" ? "read_query" : "interruption",
      periodQuery,
    };
  }

  const parsedTransactions = parseTransactionMessages(spokenMessage);
  const inlineReadAction = parsedTransactions.length > 0 ? getInlineReadAction(normalized) : null;

  if (parsedTransactions.length > 1 || (parsedTransactions.length === 1 && inlineReadAction)) {
    return {
      action: "register_movements_batch",
      confidence: parsedTransactions.some((transaction) => transaction.confidence === "low") ? "low" : "high",
      drafts: parsedTransactions.map((transaction) => transaction.draft),
      kind: state.status === "idle" ? "write_action" : "interruption",
      readAction: inlineReadAction ?? undefined,
    };
  }

  const parsedTransaction = parsedTransactions[0] ?? parseTransactionMessage(spokenMessage);

  if (parsedTransaction) {
    const action = parsedTransaction.draft.type === "entrada" ? "register_income" : "register_expense";

    return {
      action,
      confidence: parsedTransaction.confidence,
      draft: parsedTransaction.draft,
      kind: state.status === "idle" ? "write_action" : "interruption",
      missingFields: parsedTransaction.missingFields,
    };
  }

  const genericRegistrationQuestion = getGenericRegistrationQuestion(spokenMessage, normalized);

  if (genericRegistrationQuestion) {
    return {
      kind: "unsupported_or_unknown",
      reply: genericRegistrationQuestion,
    };
  }

  const readActions = getReadActions(normalized);

  if (readActions.length > 1) {
    return {
      action: readActions[0],
      kind: state.status === "idle" ? "read_query" : "interruption",
      readActions,
    };
  }

  const readAction = readActions[0] ?? getReadAction(normalized);

  if (readAction) {
    return {
      action: readAction,
      kind: state.status === "idle" ? "read_query" : "interruption",
    };
  }

  const conversationalReply = getConversationalReply(rawNormalized) ?? getConversationalReply(normalized);

  if (conversationalReply) {
    return {
      kind: rawNormalized.includes("gosta") || rawNormalized.includes("prefere") ? "small_talk" : "greeting",
      reply: appendPendingContext(conversationalReply, state),
    };
  }

  if (state.status === "idle" && confirmation !== "unclear") {
    return { kind: "confirmation" };
  }

  return null;
}

export function inferPartialFieldAnswer({
  message,
  missingFields,
}: {
  message: string;
  missingFields: MovementField[];
}): Partial<AgentMovementDraft> {
  const trimmed = stripCorrectionPrefix(message.trim());
  const normalized = normalizeText(trimmed);
  const inferred: Partial<AgentMovementDraft> = {};

  if (missingFields.includes("amount")) {
    const amount = parseAmountFromText(trimmed);

    if (amount) {
      inferred.amount = amount;
    }
  }

  if (missingFields.includes("category")) {
    const explicitCategory = readExplicitValue(trimmed, ["categoria", "cat"]);

    if (explicitCategory) {
      const category = canonicalizeCategoryInput(explicitCategory)?.category;

      if (category) {
        inferred.category = category;
      }
    }
  }

  if (missingFields.includes("description")) {
    const explicitDescription = readExplicitValue(trimmed, ["descricao", "descrição", "origem", "descrição/origem"]);

    if (explicitDescription) {
      inferred.description = explicitDescription;
    }
  }

  if (missingFields.includes("occurred_on")) {
    const occurredOn = extractExplicitDatePtBr(trimmed);

    if (occurredOn) {
      inferred.occurred_on = occurredOn;
    }
  }

  if (Object.keys(inferred).length > 0) {
    return inferred;
  }

  const onlyTextFieldsMissing = missingFields.every((field) => field === "category" || field === "description");

  if (onlyTextFieldsMissing && missingFields.length === 2 && isShortFieldAnswer(normalized)) {
    inferred.description = trimmed;
    const category = canonicalizeCategoryInput(trimmed)?.category;

    if (category) {
      inferred.category = category;
    }

    return inferred;
  }

  if (missingFields.length === 1 && missingFields[0] === "category") {
    const category = canonicalizeCategoryInput(trimmed)?.category;

    if (category) {
      inferred.category = category;
    }
  }

  if (missingFields.length === 1 && missingFields[0] === "description") {
    inferred.description = trimmed;
  }

  return inferred;
}

export function inferCorrectionFields(message: string): Partial<AgentMovementDraft> {
  const trimmed = stripCorrectionPrefix(message.trim());
  const replacement = inferDescriptionReplacement(message);
  const occurredOn = extractExplicitDatePtBr(message);
  const inferred = inferPartialFieldAnswer({
    message,
    missingFields: occurredOn ? ["category", "description", "occurred_on"] : ["amount", "category", "description", "occurred_on"],
  });

  if (replacement) {
    const replacementType = inferMovementTypeFromText(replacement.to);

    if (replacementType) {
      inferred.type = replacementType;
    } else {
      inferred.description = replacement.to;
    }
  }

  if (occurredOn) {
    delete inferred.amount;
    inferred.occurred_on = occurredOn;
  }

  if (!inferred.type) {
    inferred.type = inferMovementTypeFromText(trimmed) ?? inferMovementTypeFromText(message) ?? undefined;
  }

  const parsedCorrection = parseCorrectionTransaction(message, inferred.type);

  if (parsedCorrection && !occurredOn) {
    if (parsedCorrection.draft.amount) {
      inferred.amount = parsedCorrection.draft.amount;
    }

    if (parsedCorrection.draft.description) {
      inferred.description = parsedCorrection.draft.description;
    }

    if (parsedCorrection.draft.category) {
      inferred.category = parsedCorrection.draft.category;
    }
  }

  if (!inferred.category) {
    const category = canonicalizeCategoryInput(trimmed)?.category;

    if (category) {
      inferred.category = category;
    }
  }

  if (!inferred.amount && !inferred.category && !inferred.description && !inferred.type && !inferred.occurred_on && trimmed.length >= 2) {
    inferred.description = trimmed;
  }

  return inferred;
}

export function inferTransactionEditCorrection(
  message: string,
  missingFields: MovementField[] = [],
): AgentTransactionEditDraft {
  const editDraft: AgentTransactionEditDraft = {};
  const answer = stripCorrectionPrefix(message.trim());
  const amount = parseAmountFromText(answer);
  const replacement = inferDescriptionReplacement(message);
  const occurredOn = extractExplicitDatePtBr(message);
  const relevantMissingFields = missingFields.filter((field) =>
    field === "amount" || field === "category" || field === "description" || field === "occurred_on",
  );

  if (
    amount &&
    !occurredOn &&
    (relevantMissingFields.length === 0 || relevantMissingFields.includes("amount"))
  ) {
    editDraft.amount = amount;
  }

  if (
    !editDraft.amount &&
    !occurredOn &&
    (relevantMissingFields.length === 0 || relevantMissingFields.includes("category"))
  ) {
    const explicitCategory = readExplicitValue(answer, ["categoria", "cat"]);
    const category = canonicalizeCategoryInput(explicitCategory ?? answer)?.category;

    if (category) {
      editDraft.category = category;
    }
  }

  if (
    occurredOn &&
    (relevantMissingFields.length === 0 || relevantMissingFields.includes("occurred_on"))
  ) {
    editDraft.occurred_on = occurredOn;
  }

  if (
    Object.keys(editDraft).length === 0 &&
    (relevantMissingFields.length === 0 || relevantMissingFields.includes("description")) &&
    answer.length >= 2
  ) {
    const explicitDescription = readExplicitValue(answer, ["descricao", "descrição", "origem", "nome"]);
    editDraft.description = replacement?.to ?? explicitDescription ?? answer;
  }

  return editDraft;
}

export function inferDescriptionReplacement(message: string) {
  const positiveThenNegativeReplacement = message
    .trim()
    .match(/(?:na verdade\s+)?(?:foi|era|e|eh|é)\s+(.+?),?\s+n[aã]o\s+(.+)$/i);

  if (positiveThenNegativeReplacement?.[1] && positiveThenNegativeReplacement[2]) {
    return {
      from: cleanupCorrectionValue(positiveThenNegativeReplacement[2]),
      to: cleanupCorrectionValue(positiveThenNegativeReplacement[1]),
    };
  }

  const repeatedConnectorReplacement = message
    .trim()
    .match(/(?:n[aã]o|nao)\s+(\S+)\s+(.+?),?\s+\1\s+(.+)$/i);

  if (
    repeatedConnectorReplacement?.[1] &&
    repeatedConnectorReplacement[2] &&
    repeatedConnectorReplacement[3] &&
    ["foi", "era", "e", "eh"].includes(normalizeText(repeatedConnectorReplacement[1]))
  ) {
    return {
      from: cleanupCorrectionValue(repeatedConnectorReplacement[2]),
      to: cleanupCorrectionValue(repeatedConnectorReplacement[3]),
    };
  }

  const localNegativeReplacement = message
    .trim()
    .match(/(?:n[aã]o|nao)\s+(?:foi|era|e|eh|é)\s+(.+?),?\s+(?:foi|era|e|eh|é)\s+(.+)$/i);

  if (localNegativeReplacement?.[1] && localNegativeReplacement[2]) {
    return {
      from: cleanupCorrectionValue(localNegativeReplacement[1]),
      to: cleanupCorrectionValue(localNegativeReplacement[2]),
    };
  }

  const replacementMatch =
    message.trim().match(/n[aã]o\s+(?:foi|era)\s+(.+?),?\s+(?:foi|era)\s+(.+)$/i) ??
    message.trim().match(/(?:troca|troque|muda|mude|corrige|corrija)\s+(.+?)\s+(?:para|pra|por)\s+(.+)$/i);

  if (!replacementMatch?.[1] || !replacementMatch[2]) {
    return null;
  }

  return {
    from: cleanupCorrectionValue(replacementMatch[1]),
    to: cleanupCorrectionValue(replacementMatch[2]),
  };
}

function getTransactionEditRequest(message: string, normalized: string): {
  editDraft: AgentTransactionEditDraft;
  missingFields: MovementField[];
  target: TransactionTargetKind;
} | null {
  if (!/(corrij|corrige|corrigir|mude|muda|mudar|troque|troca|trocar|edite|edita|editar|altere|altera|alterar)/.test(normalized)) {
    return null;
  }

  const target = getLatestTransactionTarget(normalized);

  if (!target) {
    return null;
  }

  const editDraft = extractTransactionEditDraft(message, normalized);
  const missingFields = getMissingEditFields(normalized, editDraft);

  return {
    editDraft,
    missingFields,
    target,
  };
}

function extractTransactionEditDraft(message: string, normalized: string): AgentTransactionEditDraft {
  const editDraft: AgentTransactionEditDraft = {};
  const amount = parseAmountFromText(message);

  if (amount && /(valor|reais|real|r\$|\d)/.test(normalized)) {
    editDraft.amount = amount;
  }

  if (/(categoria|cat)\b/.test(normalized)) {
    const value = readAfterPara(message);
    const category = canonicalizeCategoryInput(value)?.category ?? value;

    if (category) {
      editDraft.category = category;
    }
  }

  if (/(descri|descricao|descrição|nome|origem)\b/.test(normalized)) {
    const value = readAfterPara(message);

    if (value) {
      editDraft.description = value;
    }
  }

  if (/(data|dia|ontem|hoje)\b/.test(normalized)) {
    const occurredOn = extractExplicitDatePtBr(message);

    if (occurredOn) {
      editDraft.occurred_on = occurredOn;
    }
  }

  return editDraft;
}

function getMissingEditFields(normalized: string, editDraft: AgentTransactionEditDraft): MovementField[] {
  if (Object.keys(editDraft).length > 0) {
    return [];
  }

  if (/(valor|reais|real|r\$)/.test(normalized)) {
    return ["amount"];
  }

  if (/(categoria|cat)\b/.test(normalized)) {
    return ["category"];
  }

  if (/(descri|descricao|descrição|nome|origem)\b/.test(normalized)) {
    return ["description"];
  }

  if (/(data|dia|ontem|hoje)\b/.test(normalized)) {
    return ["occurred_on"];
  }

  return ["amount", "description", "category"];
}

function getLatestTransactionTarget(normalized: string): TransactionTargetKind | null {
  if (!/(ultima|ultimo|última|último)/.test(normalized)) {
    return null;
  }

  if (/(despesa|gasto|saida|saída)/.test(normalized)) {
    return "latest_expense";
  }

  if (/(entrada|receita|recebimento)/.test(normalized)) {
    return "latest_income";
  }

  if (/(movimentacao|movimentação|registro|lancamento|lançamento)/.test(normalized)) {
    return "latest";
  }

  return null;
}

function getMarkObligationKey(normalized: string) {
  if (!hasObligationDoneIntent(normalized)) {
    return null;
  }

  return inferObligationKey(normalized);
}

function isAmbiguousObligationCompletion(normalized: string) {
  return hasObligationDoneIntent(normalized) && /(obrigacao|obrigação|tarefa|checklist|pendencia|pendência)/.test(normalized);
}

function hasObligationDoneIntent(normalized: string) {
  return /(ja|já|marque|marca|marcar|conclui|concluí|concluir|feito|entreguei|paguei|conferi|guardei)/.test(normalized);
}

function inferObligationKey(normalized: string) {
  if (/(entrada|entradas)/.test(normalized) && /(conferi|conferir|marque|marca|marcar)/.test(normalized)) {
    return "conferir-entradas";
  }

  if (/(despesa|despesas)/.test(normalized) && /(conferi|conferir|marque|marca|marcar)/.test(normalized)) {
    return "conferir-despesas";
  }

  if (/(comprovante|comprovantes|recibo|recibos|nota|notas)/.test(normalized)) {
    return "guardar-comprovantes";
  }

  if (/(fechamento|fechar|revisao|revisão|revisei|revisar)/.test(normalized)) {
    return "revisar-fechamento";
  }

  if (/(dasn|simei|declaracao|declaração)/.test(normalized)) {
    return "entregar-dasn";
  }

  if (/\bdas\b/.test(normalized)) {
    return "pagar-das";
  }

  return null;
}

function getReminderUpdate(normalized: string): AgentReminderPreferenceUpdate | null {
  if (!/(lembrete|lembretes)/.test(normalized)) {
    return null;
  }

  if (/(desative|desativa|desativar|desliga|desligue|nao quero|não quero|não quero mais|nao quero mais)/.test(normalized)) {
    return { enabled: false };
  }

  if (/(ative|ativa|ativar|ligue|liga|quero receber|receber lembretes)/.test(normalized)) {
    return { enabled: true };
  }

  return null;
}

function getInitialBalanceUpdate(message: string, normalized: string): { amount: number | null } | null {
  const hasInitialBalanceCue =
    /(saldo inicial|saldo atual|ajustar saldo|atualizar saldo|caixa inicial|base inicial|saldo de partida|caixa de partida)/.test(normalized) ||
    /(comecei|comecar|começar|inicio|iniciei).*(com|saldo|caixa)/.test(normalized) ||
    /(definir|define|atualizar|atualiza|ajustar|ajusta|colocar|coloca|registrar|registra).*(saldo|caixa)/.test(normalized) ||
    /\bmeu saldo (e|eh|é|esta|está|ta|tá|ficou|para|pra)\b/.test(normalized);

  if (!hasInitialBalanceCue) {
    return null;
  }

  return {
    amount: parseAmountFromText(message),
  };
}

function getReadAction(normalized: string): AgentActionId | null {
  if (/(lembrete|lembretes)/.test(normalized) && /(como|status|estao|estão|ativos|ativo|configurad)/.test(normalized)) {
    return "reminder_preferences_status";
  }

  if (/(limite|mei|quanto falta|faturamento anual)/.test(normalized)) {
    return "mei_limit";
  }

  if (/(obrigac|pendencia|pendente|das|dasn|tarefas|o que falta fazer|falta fazer)/.test(normalized)) {
    return "obligations_status";
  }

  if (/(ultim|recent|registros|movimentacoes recentes|movimentações recentes|minhas movimentacoes|minhas movimentações|me fala minhas movimentacoes|me fala minhas movimentações|me mostra minhas movimentacoes|me mostra minhas movimentações)/.test(normalized)) {
    return "recent_transactions";
  }

  if (/(dashboard|visao geral|visão geral|painel)/.test(normalized)) {
    return "dashboard_overview";
  }

  if (/(meu mes|meu mês|resumo|saldo|como esta|como está|como ta|como tá|quanto.*(?:gastei|gasto|gastos|despesa|despesas|entrou|entrada|entradas|recebi)|como foi meu mes|como foi meu mês|entradas.*despesas|movimentacao do mes|movimentação do mês|movimentacoes do mes|movimentações do mês|minha movimentacao do mes|minha movimentação do mês|o que eu movimentei.*mes|o que eu movimentei.*mês)/.test(normalized)) {
    return "monthly_summary";
  }

  return null;
}

function getInlineReadAction(normalized: string): AgentActionId | null {
  if (/(qual|quanto|ver|veja|olhar|consulta|consultar|me fala|mostrar|mostra|quero ver).*(limite|mei)/.test(normalized)) {
    return "mei_limit";
  }

  if (/(quais|qual|o que|ver|veja|me fala|mostrar|mostra|quero ver).*(obrigac|pendencia|pendente|falta fazer)/.test(normalized)) {
    return "obligations_status";
  }

  if (/(mostra|mostre|me mostra|me fala|quero ver|ver|veja).*(ultim|recent|registros|movimentacoes|movimentações)/.test(normalized)) {
    return "recent_transactions";
  }

  if (/(como esta|como esta meu mes|como ta|como ta meu mes|quanto.*(?:gastei|gasto|gastos|despesa|despesas|entrou|entrada|entradas|recebi)|como foi meu mes|resumo|saldo|movimentacao do mes|movimentacoes do mes|minha movimentacao do mes|o que eu movimentei.*mes)/.test(normalized)) {
    return "monthly_summary";
  }

  return null;
}

function getGenericRegistrationQuestion(message: string, normalized: string) {
  const amount = parseAmountFromText(message);
  const hasGenericAction = /\b(?:registrar|registre|registra|resgitra|lancar|lanca|lançar|lança|cadastrar|cadastra|adicionar|adicione|adiciona|colocar|coloca|bota|botar)\b/.test(normalized);
  const hasTypeCue = /\b(?:entrada|receita|recebimento|entrou|recebi|caiu|veio|venda|vendi|despesa|saida|saiu|gasto|gastei|paguei|pagar|compra|comprei)\b/.test(normalized);

  if (!amount || !hasGenericAction || hasTypeCue) {
    return null;
  }

  return `Esse valor de ${toCurrency(amount)} foi entrada ou despesa?`;
}

function getReadActions(normalized: string): AgentActionId[] {
  const matches = [
    findReadMatch(normalized, "reminder_preferences_status", /(lembrete|lembretes)/),
    findReadMatch(normalized, "mei_limit", /(limite|mei|quanto falta|faturamento anual)/),
    findReadMatch(normalized, "obligations_status", /(obrigac|pendencia|pendente|das|dasn|tarefas|o que falta fazer|falta fazer)/),
    findReadMatch(normalized, "recent_transactions", /(ultim|recent|registros|movimentacoes recentes|movimentações recentes|minhas movimentacoes|minhas movimentações|me fala minhas movimentacoes|me fala minhas movimentações|me mostra minhas movimentacoes|me mostra minhas movimentações)/),
    findReadMatch(normalized, "dashboard_overview", /(dashboard|visao geral|visão geral|painel)/),
    findReadMatch(normalized, "monthly_summary", /(meu mes|meu mês|resumo|saldo|como esta|como está|como ta|como tá|quanto.*(?:gastei|gasto|gastos|despesa|despesas|entrou|entrada|entradas|recebi)|como foi meu mes|como foi meu mês|entradas.*despesas|movimentacao do mes|movimentação do mês|movimentacoes do mes|movimentações do mês|minha movimentacao do mes|minha movimentação do mês|o que eu movimentei.*mes|o que eu movimentei.*mês)/),
  ].filter((match): match is { action: AgentActionId; index: number } => Boolean(match));

  const uniqueActions = new Set<AgentActionId>();
  return matches
    .sort((left, right) => left.index - right.index)
    .map((match) => match.action)
    .filter((action) => {
      if (uniqueActions.has(action)) {
        return false;
      }

      uniqueActions.add(action);
      return true;
    });
}

function findReadMatch(normalized: string, action: AgentActionId, pattern: RegExp) {
  const match = normalized.match(pattern);

  return match?.index === undefined ? null : { action, index: match.index };
}

function readAfterPara(message: string) {
  const match = message.match(/\b(?:para|pra|por)\s+(.+)$/i);
  return match?.[1]?.trim();
}

function getDeleteAction(normalized: string): AgentActionId | null {
  const hasDeleteVerb = /(exclu|apagar|delete|deletar|remov)/.test(normalized);
  const mentionsTarget = /(ultima|ultimo|movimentacao|movimentacoes|registro|lançamento|lancamento)/.test(normalized);

  if (hasDeleteVerb && mentionsTarget) {
    return "delete_transaction";
  }

  if (/^pode\s+(apagar|excluir|deletar)\b/.test(normalized)) {
    return "delete_transaction";
  }

  return null;
}

function getAssistantIdentityReply(normalized: string) {
  if (
    /(qual|como).*(seu nome|voce chama|vc chama)/.test(normalized) ||
    /(quem e voce|quem eh voce|quem é você|quem e vc|quem eh vc|quem e helena|quem eh helena|quem é helena)/.test(normalized)
  ) {
    return "Sou a Helena, a assistente financeira do FechouMEI. Posso te ajudar com registros, consultas e pendências do seu MEI.";
  }

  return null;
}

function getSafetyFiscalReply(normalized: string) {
  if (/(escond|ocult|omitir|sonegar|fraudar|maquiar).*(faturamento|receita|nota|fiscal|imposto|das|mei)/.test(normalized)) {
    return "Não posso te ajudar a esconder informação fiscal. Posso te ajudar a organizar seus registros corretamente para você acompanhar seu MEI com mais segurança.";
  }

  if (
    /(voce|vc).*(substitui|substituir|dispensa|troca).*(contador|contadora)/.test(normalized) ||
    /(posso|da pra|dá pra|preciso).*(ficar sem|sem).*(contador|contadora)/.test(normalized)
  ) {
    return "Não substituo contador. Eu te ajudo a organizar entradas, despesas, obrigações e relatórios para você ter mais controle e conversar melhor com seu contador.";
  }

  return null;
}

function getConversationalReply(normalized: string) {
  const plain = normalized
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/(melhor que planilha|menos pior que planilha|adeus planilha)/.test(plain)) {
    return "Haha, aí sim 😄 Minha missão é justamente te livrar da bagunça da planilha. Quer registrar ou consultar alguma coisa agora?";
  }

  if (/(me salvou|salvou demais|voce me ajudou|você me ajudou)/.test(plain)) {
    return "Boa! Fico feliz em ajudar. Quando quiser, é só me mandar as entradas e gastos do seu jeito.";
  }

  if (/(nao entendi nada|não entendi nada|confuso|confusa|to perdido|tô perdido|estou perdido|aff|que saco)/.test(plain)) {
    return "Poxa, desculpa se compliquei. Vamos no simples: você pode me mandar algo como 'vendi 150 no pix' ou 'gastei 40 no mercado' que eu organizo pra você.";
  }

  if (/(nao quero preencher nada|não quero preencher nada|so resolve|só resolve|resolve pra mim|resolve para mim)/.test(plain)) {
    return "Fechado. Me manda do seu jeito, tipo 'recebi 200 de um cliente' ou 'gastei 50 com internet', que eu transformo isso em registro pra você confirmar.";
  }

  if (/(to com pressa|tô com pressa|estou com pressa|rapidinho|rapidao|rapidão)/.test(plain)) {
    return "Beleza, vou ser direta. Me manda o valor e o motivo que eu registro rapidinho.";
  }

  if (/(faz|manda|conta).*(piada|graca|graça)/.test(plain)) {
    return "Posso tentar uma rapidinha: planilha boa é aquela que não te faz sofrer no fim do mês 😄 Agora, quer que eu te ajude com algum registro?";
  }

  if (/(quem ganhou|placar|jogo ontem|resultado do jogo|futebol|campeonato)/.test(plain)) {
    return "Essa eu não consigo acompanhar por aqui. Mas se quiser saber como ficou seu mês, seus gastos ou suas obrigações, eu te ajudo rapidinho.";
  }

  if (/(sentido da vida|qual a vida|universo)/.test(plain)) {
    return "Essa é grande demais para mim. No FechouMEI eu resolvo melhor entradas, gastos, resumo do mês e obrigações.";
  }

  if (plain === "voce" || plain === "vc" || /(voce|vc).*(ai|aqui|online|por aqui)/.test(plain)) {
    return "Tô sim. Me manda o que você quer registrar ou consultar.";
  }

  if (/^bom dia\b/.test(normalized)) {
    return "Bom dia! Quer registrar alguma movimentação ou dar uma olhada no seu mês?";
  }

  if (/^boa tarde\b/.test(normalized)) {
    return "Boa tarde! Posso te ajudar com entradas, despesas, resumo do mês e pendências.";
  }

  if (/^boa noite\b/.test(normalized)) {
    return "Boa noite! Posso te ajudar com registros rápidos, resumo do mês e obrigações.";
  }

  if (/^(oi|ola|ol.|e ai|e a.)\b/.test(normalized)) {
    return "Oi! Me manda o que você precisa registrar ou consultar.";
  }

  if (/^(oi|ola|olá|e ai|e aí|bom dia|boa tarde|boa noite)\b/.test(normalized)) {
    return "Boa! Posso te ajudar com entradas, despesas, resumo do mês e obrigações.";
  }

  if (/(tudo bem|como voce esta|como você está|beleza)/.test(normalized)) {
    return "Tudo certo por aqui. Quer ver seu mês ou registrar alguma movimentação?";
  }

  if (/(voce gosta|você gosta|sua cor|cor azul|prefere)/.test(normalized)) {
    return "Eu não tenho preferências pessoais, mas posso te ajudar a deixar seu financeiro mais organizado.";
  }

  if (/(obrigad|valeu|show|boa)/.test(normalized)) {
    return "Boa! Quando quiser, é só me mandar as entradas e gastos do seu jeito.";
  }

  return null;
}

function getCategoryCatalogReply(normalized: string) {
  if (!/(categoria|categorias)/.test(normalized)) {
    return null;
  }

  if (!/(quais|qual|existem|existe|tem|lista|mostrar|mostra|me fala|sao|são)/.test(normalized)) {
    return null;
  }

  const categories = getOfficialMovementCategories().map((category) => category.toLocaleUpperCase("pt-BR"));
  return `As categorias do app são: ${categories.join(", ")}. Use OUTRO só quando não encaixar em nenhuma delas.`;
}

function isCapabilitiesQuestion(normalized: string) {
  return (
    /^(me ajuda|ajuda|me ajuda aqui|me ajuda ai|me ajuda aí)(?:\b|$)/.test(normalized) ||
    /(como uso isso|como usar isso|como funciona isso)/.test(normalized) ||
    /(o que|que).*(voce|vc|helena).*(pode|consegue|faz|sabe fazer)/.test(normalized) ||
    /(como).*(voce|vc|helena).*(pode me ajudar|funciona|me ajuda)/.test(normalized) ||
    /(me da|manda|mostra|me fala).*(exemplo|exemplos)/.test(normalized) ||
    /(o que eu posso|o que posso).*(pedir|mandar|falar)/.test(normalized) ||
    /(me fala).*(o que).*(voce|vc|helena).*(faz|consegue)/.test(normalized)
  );
}

function appendPendingContext(reply: string, state: AgentConversationState) {
  if (state.status === "idle") {
    return reply;
  }

  return `${reply} Seu rascunho continua salvo.`;
}

function isCancelation(normalized: string) {
  if (/^(pode cancelar|nao salva|nao salve|nao anota|nao grave|nao grava|descarta|descarta isso|desconsidera|aborta|aborta isso|cancela isso)\b/.test(normalized)) {
    return true;
  }

  return /^(cancelar|cancela|cancele|deixa quieto|deixa pra la|deixa pra lá|esquece|esquece isso|melhor nao|melhor não|para isso|para|não salva|nao salva|nao quero mais|não quero mais|nao, cancela|não, cancela|desistir)\b/.test(normalized);
}

function isCorrection(normalized: string) {
  if (isCancelation(normalized)) {
    return false;
  }

  if (/^(?:nao|não|n)\s+(?:foi|era|e|eh|dia)\b.+\b(?:foi|era|e|eh)\b.+/.test(normalized)) {
    return true;
  }

  if (/^(?:nao|não|n),?\s*era\b.+/.test(normalized)) {
    return true;
  }

  if (/^(e\s+)?foi\s+(ontem|hoje|\d{1,2}\/\d{1,2})\b/.test(normalized)) {
    return true;
  }

  if (/^(?:coloca|bota|poe|passa|deixa|joga)\s+(?:pra|para)\s+(?:ontem|hoje|amanha|semana que vem|semana passada)\b/.test(normalized)) {
    return true;
  }

  if (/^(na verdade|corrige|corrigir|troca|muda|alterar|altera|era|quero mudar|quis dizer)\b/.test(normalized)) {
    return true;
  }

  const negativeCorrection = normalized.match(/^(?:nao|não|n),?\s+(.+)$/);

  if (!negativeCorrection) {
    return false;
  }

  const value = negativeCorrection[1].trim();

  if (!value || /^(cancelar|cancela|deixa|esquece|melhor nao|melhor não|quero|preciso)\b/.test(value)) {
    return false;
  }

  return (
    Boolean(parseAmountFromText(value)) ||
    /\b(era|muda|troca|categoria|descricao|descrição|valor|entrada|despesa|cliente|servico|serviço|material|ferramenta|imposto|transporte|alimentacao|alimentação|venda|outro)\b/.test(value) ||
    value.split(/\s+/).filter(Boolean).length <= 3
  );
}

function readExplicitValue(message: string, labels: string[]) {
  const labelPattern = labels.join("|");
  const match = message.match(new RegExp(`(?:${labelPattern})\\s*(?::|=|é|eh|era|para|pra)?\\s*(.+)$`, "i"));
  return match?.[1]?.trim();
}

function cleanupCorrectionValue(value: string) {
  return value
    .replace(/\b(?:o|a|os|as|meu|minha|do|da|de|para|pra|por)\b/gi, " ")
    .replace(/[,.!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function inferMovementTypeFromText(value: string): AgentMovementDraft["type"] | null {
  const normalized = normalizeText(value);
  const hasExpenseActionCue = /\b(despesa|gasto|gastei|paguei|comprei|saida|saiu|boleto|custou|fornecedor)\b/.test(normalized);
  const hasExpenseContextCue = /\b(mercado|almoco|jantar|lanche|internet|material)\b/.test(normalized);
  const hasIncomeActionCue = /\b(entrada|receita|recebimento|recebi|entrou|caiu|ganhei|vendi|faturei|faturou|cliente pagou|pix recebido)\b/.test(normalized);
  const hasExpenseCue = hasExpenseActionCue || (!hasIncomeActionCue && hasExpenseContextCue);
  const hasIncomeCue = hasIncomeActionCue;

  if (hasExpenseCue && hasIncomeCue) {
    if (/\b(?:foi|era|e|eh|ser)\s+(entrada|receita|recebimento)\b/.test(normalized) || /\bnao\s+(despesa|gasto|saida)\b/.test(normalized)) {
      return "entrada";
    }

    if (/\b(?:foi|era|e|eh|ser)\s+(despesa|gasto|saida)\b/.test(normalized) || /\bnao\s+(entrada|receita|recebimento)\b/.test(normalized)) {
      return "despesa";
    }
  }

  if (hasExpenseCue && !hasIncomeCue) {
    return "despesa";
  }

  if (hasIncomeCue && !hasExpenseCue) {
    return "entrada";
  }

  return null;
}

function parseCorrectionTransaction(message: string, type?: AgentMovementDraft["type"]) {
  const parsed = parseTransactionMessage(message, type);

  if (!parsed?.draft.amount) {
    return null;
  }

  return parsed;
}

function isShortFieldAnswer(normalized: string) {
  return normalized.split(/\s+/).filter(Boolean).length <= 3;
}

function stripCorrectionPrefix(message: string) {
  return message
    .replace(/^\s*(?:não|nao|n),?\s*/i, "")
    .replace(/^\s*(?:na verdade|quis dizer|era|era para ser|era pra ser)\s+/i, "")
    .replace(/^\s*(?:era|era para ser|era pra ser)\s+/i, "")
    .replace(/^\s*(?:coloca|bota|põe|poe|passa|deixa|joga)\s+(?:para|pra)?\s*/i, "")
    .replace(/^\s*(?:muda|mude|troca|troque|corrige|corrija)\s+(?:para|pra)?\s*/i, "")
    .trim();
}
