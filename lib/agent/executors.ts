import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AgentActionId,
  AgentDeleteTarget,
  AgentMovementDraft,
  AgentQuickPeriodQuery,
  AgentReminderPreferenceUpdate,
  AgentSpecificMovementQuery,
  AgentTransactionEditDraft,
  MovementType,
  ReminderPreferenceKey,
  TransactionTargetKind,
} from "@/lib/agent/types";
import {
  MEI_ANNUAL_LIMIT,
  formatDateLabel,
  getCurrentMonthRange,
  getCurrentYearRange,
  toCurrency,
  toDateInputValue,
} from "@/lib/agent/utils";
import {
  buildOccurredAtFromDateInput,
  normalizeMovementCategory,
  normalizeMovementDescription,
} from "@/lib/movements/normalization";
import {
  buildQuickPeriodReply,
  buildWeeklyExtremeReply,
  filterMovementsByRange,
  getCurrentMonthWeeks,
  resolveQuickPeriodRange,
  summarizeMovementRows,
} from "@/lib/agent/period-queries";
import type { Database } from "@/types/database";

export type AgentExecutionContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

const obligationLabels: Record<string, string> = {
  "conferir-despesas": "Conferir despesas do mês",
  "conferir-entradas": "Conferir entradas do mês",
  "entregar-dasn": "Entregar DASN-SIMEI anual",
  "guardar-comprovantes": "Guardar comprovantes do mês",
  "pagar-das": "Pagar DAS mensal",
  "revisar-fechamento": "Revisar o fechamento do mês",
};

const reminderLabels: Record<ReminderPreferenceKey, string> = {
  das_monthly_enabled: "DAS mensal",
  dasn_annual_enabled: "DASN-SIMEI anual",
  monthly_review_enabled: "revisão do mês",
  receipts_enabled: "guardar comprovantes",
};

const reminderKeys = Object.keys(reminderLabels) as ReminderPreferenceKey[];

type PeriodMovementRow = {
  amount: number;
  occurred_on: string;
  type: MovementType;
};

type AgentDateRange = {
  end: string;
  start: string;
};

type BalanceProfileRow = {
  initial_balance: number | string | null;
};

export async function executeMovementRegistration(
  context: AgentExecutionContext,
  draft: Required<AgentMovementDraft>,
) {
  const { data, error } = await context.supabase
    .from("movimentacoes")
    .insert({
      amount: draft.amount,
      category: normalizeMovementCategory(draft.category),
      description: normalizeMovementDescription(draft.description),
      occurred_at: buildOccurredAtFromDateInput(draft.occurred_on),
      occurred_on: draft.occurred_on,
      type: draft.type,
      user_id: context.userId,
    })
    .select("id, type, amount, description, category, occurred_on")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/app/dashboard");
  revalidatePath("/app/fechamento-mensal");
  revalidatePath("/app/movimentacoes");

  return {
    movement: data,
    reply: getMovementRegistrationReply(data),
  };
}

export async function executeMovementBatchRegistration(
  context: AgentExecutionContext,
  drafts: Array<Required<AgentMovementDraft>>,
) {
  const { data, error } = await context.supabase
    .from("movimentacoes")
    .insert(
      drafts.map((draft) => ({
        amount: draft.amount,
        category: normalizeMovementCategory(draft.category),
        description: normalizeMovementDescription(draft.description),
        occurred_at: buildOccurredAtFromDateInput(draft.occurred_on),
        occurred_on: draft.occurred_on,
        type: draft.type,
        user_id: context.userId,
      })),
    )
    .select("id, type, amount, description, category, occurred_on");

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.length !== drafts.length) {
    throw new Error("Nem todas as movimentações foram confirmadas pelo banco.");
  }

  revalidatePath("/app/dashboard");
  revalidatePath("/app/fechamento-mensal");
  revalidatePath("/app/movimentacoes");

  return {
    movements: data,
    reply: getMovementBatchRegistrationReply(data),
  };
}

export async function getLatestMovementForDeletion(
  context: AgentExecutionContext,
): Promise<AgentDeleteTarget | null> {
  return getLatestMovement(context, "latest");
}

export async function getLatestMovement(
  context: AgentExecutionContext,
  target: TransactionTargetKind = "latest",
): Promise<AgentDeleteTarget | null> {
  let query = context.supabase
    .from("movimentacoes")
    .select("id, type, amount, description, category, occurred_on")
    .eq("user_id", context.userId);

  if (target === "latest_expense") {
    query = query.eq("type", "despesa");
  }

  if (target === "latest_income") {
    query = query.eq("type", "entrada");
  }

  const { data, error } = await query
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data || (data.type !== "entrada" && data.type !== "despesa")) {
    return null;
  }

  return {
    amount: data.amount,
    category: data.category,
    description: data.description,
    id: data.id,
    occurred_on: data.occurred_on,
    type: data.type,
  };
}

export async function executeTransactionDeletion(
  context: AgentExecutionContext,
  target: AgentDeleteTarget,
) {
  const { error } = await context.supabase
    .from("movimentacoes")
    .delete()
    .eq("id", target.id)
    .eq("user_id", context.userId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/app/dashboard");
  revalidatePath("/app/fechamento-mensal");
  revalidatePath("/app/movimentacoes");

  return `Pronto, excluí a movimentação: ${formatMovementForDeletion(target)}.`;
}

export function formatMovementForDeletion(target: AgentDeleteTarget) {
  const typeLabel = target.type === "entrada" ? "uma entrada" : "uma despesa";
  const connector = target.type === "entrada" ? "de" : "com";
  const dateLabel = formatDateLabel(target.occurred_on);
  const datePart = dateLabel === "hoje" ? "hoje" : `em ${dateLabel}`;

  return `${typeLabel} de ${toCurrency(target.amount)} ${connector} ${target.description}, ${datePart}`;
}

export function formatMovementForReply(target: AgentDeleteTarget) {
  const typeLabel = target.type === "entrada" ? "entrada" : "despesa";
  const connector = target.type === "entrada" ? "de" : "com";
  return `${typeLabel} de ${toCurrency(target.amount)} ${connector} ${target.description}, ${formatDateLabel(target.occurred_on)}`;
}

export async function getLatestTransactionReply(
  context: AgentExecutionContext,
  target: TransactionTargetKind = "latest",
) {
  const movement = await getLatestMovement(context, target);

  if (!movement) {
    return getMissingLatestMovementReply(target);
  }

  return `Sua última ${getTargetLabel(target, movement.type)} foi: ${formatMovementForReply(movement)}.`;
}

type SpecificMovementRow = AgentDeleteTarget & {
  created_at?: string | null;
};

export async function executeSpecificMovementQuery(
  context: AgentExecutionContext,
  query: AgentSpecificMovementQuery,
) {
  const range = resolveSpecificMovementRange(query);
  const targetLimit = query.order === "nth" ? Math.max(query.ordinal ?? 1, 1) : query.limit ?? 1;
  let request = context.supabase
    .from("movimentacoes")
    .select("id, type, amount, description, category, occurred_on, created_at")
    .eq("user_id", context.userId);

  if (query.type) {
    request = request.eq("type", query.type);
  }

  if (query.category) {
    request = request.eq("category", normalizeMovementCategory(query.category));
  }

  if (range) {
    request = request.gte("occurred_on", range.start).lte("occurred_on", range.end);
  }

  if (query.searchTerm) {
    request = request.ilike("description", `%${escapeIlikeValue(query.searchTerm)}%`);
  }

  if (query.order === "highest" || query.order === "lowest") {
    request = request.order("amount", { ascending: query.order === "lowest" });
  } else {
    const ascending = query.order === "first" || query.order === "nth";
    request = request
      .order("occurred_on", { ascending })
      .order("created_at", { ascending });
  }

  const { data, error } = await request.limit(Math.max(targetLimit, 1));

  if (error) {
    throw new Error(error.message);
  }

  const rows = normalizeSpecificMovementRows(data ?? []);

  if (rows.length === 0) {
    return getSpecificMovementNotFoundReply(query);
  }

  if ((query.limit ?? 1) > 1 && query.order === "latest") {
    return getSpecificMovementListReply(query, rows);
  }

  const selected = query.order === "nth" ? rows[(query.ordinal ?? 1) - 1] : rows[0];

  if (!selected) {
    return getSpecificMovementNotFoundReply(query);
  }

  return getSpecificMovementReply(query, selected);
}

export async function executeTransactionEdit(
  context: AgentExecutionContext,
  target: AgentDeleteTarget,
  edit: AgentTransactionEditDraft,
  targetKind: TransactionTargetKind = "latest",
) {
  const update: {
    amount?: number;
    category?: string;
    description?: string;
    occurred_at?: string;
    occurred_on?: string;
  } = {};

  if (typeof edit.amount === "number" && edit.amount > 0) {
    update.amount = edit.amount;
  }

  if (edit.category?.trim()) {
    update.category = normalizeMovementCategory(edit.category);
  }

  if (edit.description?.trim()) {
    update.description = normalizeMovementDescription(edit.description);
  }

  if (edit.occurred_on?.trim()) {
    update.occurred_on = edit.occurred_on.trim();
    update.occurred_at = buildOccurredAtFromDateInput(edit.occurred_on.trim());
  }

  if (Object.keys(update).length === 0) {
    return {
      movement: target,
      reply: "Não encontrei o que mudar nessa movimentação.",
    };
  }

  const { data, error } = await context.supabase
    .from("movimentacoes")
    .update(update)
    .eq("id", target.id)
    .eq("user_id", context.userId)
    .select("id, type, amount, description, category, occurred_on")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  assertTransactionEditPersisted(data, update);

  revalidatePath("/app/dashboard");
  revalidatePath("/app/fechamento-mensal");
  revalidatePath("/app/movimentacoes");

  return {
    movement: data,
    reply: getTransactionEditSuccessReply(target, data, update, targetKind),
  };
}

function getTransactionEditSuccessReply(
  previous: AgentDeleteTarget,
  updated: AgentDeleteTarget,
  edit: AgentTransactionEditDraft,
  targetKind: TransactionTargetKind,
) {
  const targetLabel = getEditTargetLabel(targetKind);
  const changedFields = Object.keys(edit).filter((field) => field !== "occurred_at");

  if (changedFields.length === 1 && typeof edit.amount === "number") {
    return `Pronto, mudei o valor da sua ${targetLabel} de ${toCurrency(previous.amount)} para ${toCurrency(updated.amount)}.`;
  }

  if (changedFields.length === 1 && edit.description) {
    return `Pronto, troquei a descrição da sua ${targetLabel} para ${updated.description}.`;
  }

  if (changedFields.length === 1 && edit.category) {
    return `Pronto, mudei a categoria da sua ${targetLabel} de ${formatCategoryForReply(previous.category)} para ${formatCategoryForReply(updated.category)}.`;
  }

  if (changedFields.length === 1 && edit.occurred_on) {
    return `Pronto, mudei a data da sua ${targetLabel} para ${formatDateLabel(updated.occurred_on)}.`;
  }

  return `Pronto, atualizei ${formatEditedFieldsForReply(edit)} da sua ${targetLabel}.`;
}

function assertTransactionEditPersisted(
  updated: AgentDeleteTarget,
  edit: {
    amount?: number;
    category?: string;
    description?: string;
    occurred_at?: string;
    occurred_on?: string;
  },
) {
  if (typeof edit.amount === "number" && updated.amount !== edit.amount) {
    throw new Error("O valor atualizado não foi confirmado pelo banco.");
  }

  if (edit.category && updated.category !== edit.category) {
    throw new Error("A categoria atualizada não foi confirmada pelo banco.");
  }

  if (edit.description && updated.description !== edit.description) {
    throw new Error("A descrição atualizada não foi confirmada pelo banco.");
  }

  if (edit.occurred_on && updated.occurred_on !== edit.occurred_on) {
    throw new Error("A data atualizada não foi confirmada pelo banco.");
  }
}

function getEditTargetLabel(targetKind: TransactionTargetKind) {
  if (targetKind === "latest_expense") {
    return "última despesa";
  }

  if (targetKind === "latest_income") {
    return "última entrada";
  }

  return "última movimentação";
}

function formatCategoryForReply(category: string) {
  return category.trim().toLowerCase();
}

function formatEditedFieldsForReply(edit: AgentTransactionEditDraft) {
  const fields: string[] = [];

  if (typeof edit.amount === "number") {
    fields.push("o valor");
  }

  if (edit.description) {
    fields.push("a descrição");
  }

  if (edit.category) {
    fields.push("a categoria");
  }

  if (edit.occurred_on) {
    fields.push("a data");
  }

  if (fields.length === 0) {
    return "a movimentação";
  }

  if (fields.length === 1) {
    return fields[0];
  }

  return `${fields.slice(0, -1).join(", ")} e ${fields.at(-1)}`;
}

export async function executeMarkObligation(context: AgentExecutionContext, itemKey: string) {
  const month = getCurrentMonthRange();
  const label = obligationLabels[itemKey];

  if (!label) {
    return "Não identifiquei qual obrigação marcar.";
  }

  const { error } = await context.supabase.from("obrigacoes_checklist").upsert(
    {
      done: true,
      item_key: itemKey,
      month: month.key,
      user_id: context.userId,
    },
    { onConflict: "user_id,month,item_key" },
  );

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/app/obrigacoes");

  return `Pronto, marquei como concluída: ${label}.`;
}

export async function getReminderPreferencesStatus(context: AgentExecutionContext) {
  const preferences = await getOrCreateReminderPreferences(context);
  const active = reminderKeys.filter((key) => preferences[key]);

  if (active.length === 0) {
    return "Seus lembretes estão desativados. Eles ficam salvos como preferência, mas ainda não enviam notificações externas.";
  }

  return `Lembretes ativos: ${active.map((key) => reminderLabels[key]).join(", ")}. Ainda não há envio externo nesta etapa.`;
}

export async function executeReminderPreferencesUpdate(
  context: AgentExecutionContext,
  update: AgentReminderPreferenceUpdate,
) {
  const keys = update.keys && update.keys.length > 0 ? update.keys : reminderKeys;
  const payload = keys.reduce<Partial<Record<ReminderPreferenceKey, boolean>>>(
    (acc, key) => {
      acc[key] = update.enabled;
      return acc;
    },
    {},
  );

  const current = await getOrCreateReminderPreferences(context);
  const next = {
    das_monthly_enabled: current.das_monthly_enabled,
    dasn_annual_enabled: current.dasn_annual_enabled,
    monthly_review_enabled: current.monthly_review_enabled,
    receipts_enabled: current.receipts_enabled,
    ...payload,
  };

  const { error } = await context.supabase.from("reminder_preferences").upsert(
    {
      ...next,
      user_id: context.userId,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/app/obrigacoes");

  return update.enabled
    ? "Pronto, ativei seus lembretes no app. Ainda não há envio externo nesta etapa."
    : "Pronto, desativei seus lembretes.";
}

export async function executeInitialBalanceUpdate(context: AgentExecutionContext, amount: number) {
  if (!Number.isFinite(amount) || amount < 0) {
    return "Me diga um valor válido para ajustar seu saldo.";
  }

  const normalizedAmount = Math.round(amount * 100) / 100;
  const { error } = await context.supabase
    .from("profiles")
    .update({
      initial_balance: normalizedAmount,
    })
    .eq("id", context.userId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/app/dashboard");
  revalidatePath("/app/fechamento-mensal");
  revalidatePath("/app/movimentacoes");
  revalidatePath("/app/configuracoes");

  return `Pronto, ajustei seu saldo atual para ${toCurrency(normalizedAmount)}. Isso não entrou como receita nem afeta o limite do MEI.`;
}

export async function executeReadAction(context: AgentExecutionContext, actionId: AgentActionId) {
  if (actionId === "monthly_summary") {
    return getMonthlySummary(context);
  }

  if (actionId === "dashboard_overview") {
    return getDashboardOverview(context);
  }

  if (actionId === "mei_limit") {
    return getMeiLimit(context);
  }

  if (actionId === "obligations_status") {
    return getObligationsStatus(context);
  }

  if (actionId === "recent_transactions") {
    return getRecentTransactions(context);
  }

  if (actionId === "reminder_preferences_status") {
    return getReminderPreferencesStatus(context);
  }

  return "Ainda não consigo fazer isso por aqui. Nesta fase, já consigo registrar movimentações, consultar resumo, limite, obrigações e registros recentes.";
}

export async function executeQuickPeriodQuery(context: AgentExecutionContext, query: AgentQuickPeriodQuery) {
  const now = new Date();

  if (query.type === "weekly_extreme") {
    const month = getCurrentMonthRange(now);
    const weeks = getCurrentMonthWeeks(now);
    const movementType = query.metric === "income" ? "entrada" : "despesa";
    const rows = await fetchMovementsForDateRange(context, month, {
      debugLabel: "weekly_extreme",
      movementType,
    });

    return buildWeeklyExtremeReply(query, weeks, rows);
  }

  const range = resolveQuickPeriodRange(query, now);
  const rows = await fetchMovementsForDateRange(context, range, {
    debugLabel: "period",
    movementType: getMovementTypeForPeriodMetric(query.metric),
  });

  return buildQuickPeriodReply(query, range, rows);
}

async function fetchMovementsForDateRange(
  context: AgentExecutionContext,
  range: AgentDateRange,
  options: {
    debugLabel: "period" | "weekly_extreme";
    movementType?: MovementType;
  },
) {
  let request = context.supabase
    .from("movimentacoes")
    .select("type, amount, occurred_on")
    .eq("user_id", context.userId)
    .gte("occurred_on", range.start)
    .lte("occurred_on", range.end);

  if (options.movementType) {
    request = request.eq("type", options.movementType);
  }

  const { data, error } = await request.order("occurred_on", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const normalizedRows = normalizePeriodMovementRows(data ?? []);
  const rangeRows = filterMovementsByRange(normalizedRows, range);

  logQuickPeriodTrace({
    debugLabel: options.debugLabel,
    movementType: options.movementType,
    queryReturnedRows: normalizedRows.length,
    queryStats: getPeriodRowsStats(normalizedRows),
    range,
    rangeRows: rangeRows.length,
    rangeStats: getPeriodRowsStats(rangeRows),
    totals: summarizeMovementRows(rangeRows),
    userId: context.userId,
  });

  return rangeRows;
}

function getMovementTypeForPeriodMetric(metric: Extract<AgentQuickPeriodQuery, { type: "period" }>["metric"]) {
  if (metric === "income") {
    return "entrada";
  }

  if (metric === "expense") {
    return "despesa";
  }

  return undefined;
}

function normalizePeriodMovementRows(rows: Array<{ amount: number | string; occurred_on: string; type: string }>): PeriodMovementRow[] {
  return rows
    .map((row) => ({
      amount: Number(row.amount),
      occurred_on: row.occurred_on,
      type: row.type,
    }))
    .filter((row): row is PeriodMovementRow =>
      (row.type === "entrada" || row.type === "despesa") &&
      Number.isFinite(row.amount) &&
      /^\d{4}-\d{2}-\d{2}$/.test(row.occurred_on),
    );
}

function getPeriodRowsStats(rows: PeriodMovementRow[]) {
  if (rows.length === 0) {
    return {
      maxOccurredOn: null,
      minOccurredOn: null,
    };
  }

  return {
    maxOccurredOn: rows[rows.length - 1]?.occurred_on ?? null,
    minOccurredOn: rows[0]?.occurred_on ?? null,
  };
}

function logQuickPeriodTrace(payload: {
  debugLabel: "period" | "weekly_extreme";
  movementType?: MovementType;
  queryReturnedRows: number;
  queryStats: ReturnType<typeof getPeriodRowsStats>;
  range: AgentDateRange;
  rangeRows: number;
  rangeStats: ReturnType<typeof getPeriodRowsStats>;
  totals: ReturnType<typeof summarizeMovementRows>;
  userId: string;
}) {
  if (process.env.AGENT_PERIOD_DEBUG !== "1") {
    return;
  }

  console.info("Agent quick period trace", {
    ...payload,
    userId: payload.userId.slice(0, 8),
  });
}

async function getMonthlySummary({ supabase, userId }: AgentExecutionContext) {
  const month = getCurrentMonthRange();
  const { data, error } = await supabase
    .from("movimentacoes")
    .select("type, amount")
    .eq("user_id", userId)
    .gte("occurred_on", month.start)
    .lte("occurred_on", month.end);

  if (error) {
    throw new Error(error.message);
  }

  const totals = summarizeMovements(data ?? []);
  const balance = totals.income - totals.expense;

  return `Em ${month.label}: entradas ${toCurrency(totals.income)}, despesas ${toCurrency(totals.expense)} e resultado do mês ${toCurrency(balance)}.`;
}

async function getDashboardOverview(context: AgentExecutionContext) {
  const month = getCurrentMonthRange();
  const year = getCurrentYearRange();
  const [yearResult, allResult, initialBalance] = await Promise.all([
    context.supabase
      .from("movimentacoes")
      .select("type, amount, occurred_on")
      .eq("user_id", context.userId)
      .gte("occurred_on", year.start)
      .lte("occurred_on", year.end),
    context.supabase
      .from("movimentacoes")
      .select("type, amount")
      .eq("user_id", context.userId),
    getInitialBalance(context),
  ]);

  if (yearResult.error) {
    throw new Error(yearResult.error.message);
  }

  if (allResult.error) {
    throw new Error(allResult.error.message);
  }

  const totals = (yearResult.data ?? []).reduce(
    (acc, movement) => {
      const isCurrentMonth = movement.occurred_on >= month.start && movement.occurred_on <= month.end;

      if (movement.type === "entrada") {
        acc.annualIncome += movement.amount;

        if (isCurrentMonth) {
          acc.monthlyIncome += movement.amount;
        }
      } else if (isCurrentMonth) {
        acc.monthlyExpense += movement.amount;
      }

      return acc;
    },
    { annualIncome: 0, monthlyExpense: 0, monthlyIncome: 0 },
  );

  const monthBalance = totals.monthlyIncome - totals.monthlyExpense;
  const cashBalance = getCashBalance(initialBalance, allResult.data ?? []);

  return `Visão geral: ${toCurrency(totals.monthlyIncome)} em entradas do mês, ${toCurrency(totals.monthlyExpense)} em despesas do mês, resultado do mês ${toCurrency(monthBalance)}, saldo atual ${toCurrency(cashBalance)} e faturamento anual ${toCurrency(totals.annualIncome)}.`;
}

async function getMeiLimit({ supabase, userId }: AgentExecutionContext) {
  const year = getCurrentYearRange();
  const { data, error } = await supabase
    .from("movimentacoes")
    .select("amount")
    .eq("user_id", userId)
    .eq("type", "entrada")
    .gte("occurred_on", year.start)
    .lte("occurred_on", year.end);

  if (error) {
    throw new Error(error.message);
  }

  const annualIncome = (data ?? []).reduce((sum, movement) => sum + movement.amount, 0);
  const remaining = Math.max(MEI_ANNUAL_LIMIT - annualIncome, 0);
  const usedPercent = Math.min((annualIncome / MEI_ANNUAL_LIMIT) * 100, 100);

  return `Você usou ${usedPercent.toFixed(1).replace(".", ",")}% do limite do MEI: ${toCurrency(annualIncome)} no ano e ${toCurrency(remaining)} restantes.`;
}

async function getObligationsStatus({ supabase, userId }: AgentExecutionContext) {
  const month = getCurrentMonthRange();
  const { data, error } = await supabase
    .from("obrigacoes_checklist")
    .select("item_key, done")
    .eq("user_id", userId)
    .eq("month", month.key);

  if (error) {
    throw new Error(error.message);
  }

  const rows = data ?? [];
  const pending = Object.entries(obligationLabels)
    .filter(([key]) => !rows.some((row) => row.item_key === key && row.done))
    .map(([, label]) => label);

  if (pending.length === 0) {
    return "Suas obrigações do mês estão marcadas como concluídas.";
  }

  return `Pendências principais: ${pending.slice(0, 4).join(", ")}${pending.length > 4 ? "..." : "."}`;
}

async function getRecentTransactions({ supabase, userId }: AgentExecutionContext) {
  const { data, error } = await supabase
    .from("movimentacoes")
    .select("type, description, amount, occurred_on, category")
    .eq("user_id", userId)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.length === 0) {
    return "Você ainda não tem movimentações registradas.";
  }

  const items = data.map((movement) => {
    const typeLabel = movement.type === "entrada" ? "entrada" : "despesa";
    const connector = movement.type === "entrada" ? "de" : "com";
    return `${typeLabel} de ${toCurrency(movement.amount)} ${connector} ${movement.description}`;
  });

  return `Seus últimos registros foram: ${items.join("; ")}.`;
}

function getMovementRegistrationReply(draft: Required<AgentMovementDraft>) {
  const typeLabel = draft.type === "entrada" ? "uma entrada" : "uma despesa";
  const connector = draft.type === "entrada" ? "de" : "com";
  const category = draft.category ? ` na categoria ${draft.category.toLowerCase()}` : "";

  return `Pronto, registrei ${typeLabel} de ${toCurrency(draft.amount)} ${connector} ${draft.description}${category}.`;
}

function getMovementBatchRegistrationReply(movements: AgentDeleteTarget[]) {
  if (movements.length === 1) {
    return getMovementRegistrationReply(movements[0]);
  }

  const items = movements.map((movement, index) => {
    const typeLabel = movement.type === "entrada" ? "entrada" : "despesa";
    const connector = movement.type === "entrada" ? "de" : "com";
    return `${index + 1}. ${typeLabel} de ${toCurrency(movement.amount)} ${connector} ${movement.description}`;
  });

  return `Pronto, registrei ${movements.length} movimentações:\n${items.join("\n")}`;
}

async function getOrCreateReminderPreferences(context: AgentExecutionContext) {
  const { data, error } = await context.supabase
    .from("reminder_preferences")
    .select("user_id, das_monthly_enabled, dasn_annual_enabled, monthly_review_enabled, receipts_enabled, created_at, updated_at")
    .eq("user_id", context.userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (data) {
    return data;
  }

  const { data: created, error: createError } = await context.supabase
    .from("reminder_preferences")
    .insert({ user_id: context.userId })
    .select("user_id, das_monthly_enabled, dasn_annual_enabled, monthly_review_enabled, receipts_enabled, created_at, updated_at")
    .single();

  if (createError) {
    throw new Error(createError.message);
  }

  return created;
}

function getMissingLatestMovementReply(target: TransactionTargetKind) {
  if (target === "latest_expense") {
    return "Não encontrei despesas registradas ainda.";
  }

  if (target === "latest_income") {
    return "Não encontrei entradas registradas ainda.";
  }

  return "Não encontrei movimentações registradas ainda.";
}

function normalizeSpecificMovementRows(rows: Array<{
  amount: number | string;
  category: string | null;
  created_at?: string | null;
  description: string | null;
  id: string;
  occurred_on: string;
  type: string;
}>): SpecificMovementRow[] {
  return rows
    .map((row) => ({
      amount: Number(row.amount),
      category: row.category ?? "",
      created_at: row.created_at,
      description: row.description ?? "",
      id: row.id,
      occurred_on: row.occurred_on,
      type: row.type,
    }))
    .filter((row) =>
      (row.type === "entrada" || row.type === "despesa") &&
      Number.isFinite(row.amount) &&
      Boolean(row.id) &&
      Boolean(row.occurred_on),
    )
    .map((row) => ({
      ...row,
      type: row.type as MovementType,
    }));
}

function getSpecificMovementReply(query: AgentSpecificMovementQuery, movement: SpecificMovementRow) {
  const descriptor = getSpecificMovementDescriptor(query, movement);

  if (query.requestedField === "date") {
    return `${descriptor} foi em ${formatDateLabel(movement.occurred_on)}, no valor de ${toCurrency(movement.amount)}.`;
  }

  if (query.requestedField === "amount") {
    return `${descriptor} foi de ${toCurrency(movement.amount)}, em ${formatDateLabel(movement.occurred_on)}.`;
  }

  const connector = movement.type === "entrada" ? "de" : "com";
  return `${descriptor} foi ${toCurrency(movement.amount)} ${connector} ${movement.description}, em ${formatDateLabel(movement.occurred_on)}.`;
}

function getSpecificMovementListReply(query: AgentSpecificMovementQuery, rows: SpecificMovementRow[]) {
  const label = getQueryTargetLabel(query);
  const items = rows.map((row, index) => {
    const connector = row.type === "entrada" ? "de" : "com";
    return `${index + 1}. ${toCurrency(row.amount)} ${connector} ${row.description}, ${formatDateLabel(row.occurred_on)}`;
  });

  return `Encontrei estas ${label}: ${items.join("; ")}.`;
}

function getSpecificMovementNotFoundReply(query: AgentSpecificMovementQuery) {
  return `NÃ£o encontrei ${getQueryTargetLabel(query)}${getQueryFilterLabel(query)}.`;
}

function getSpecificMovementDescriptor(query: AgentSpecificMovementQuery, movement: SpecificMovementRow) {
  const typeLabel = movement.type === "entrada" ? "entrada" : "despesa";
  const base =
    query.order === "highest"
      ? `Sua maior ${typeLabel}`
      : query.order === "lowest"
        ? `Sua menor ${typeLabel}`
        : query.order === "latest"
          ? `Sua Ãºltima ${typeLabel}`
          : query.order === "nth"
            ? `Sua ${getOrdinalLabel(query.ordinal ?? 2)} ${typeLabel}`
            : `Sua primeira ${typeLabel}`;

  return `${base}${getQueryFilterLabel(query)}`;
}

function getQueryTargetLabel(query: AgentSpecificMovementQuery) {
  if (query.type === "entrada") {
    return query.limit && query.limit > 1 ? "entradas" : "entrada";
  }

  if (query.type === "despesa") {
    return query.limit && query.limit > 1 ? "despesas" : "despesa";
  }

  return query.limit && query.limit > 1 ? "movimentaÃ§Ãµes" : "movimentaÃ§Ã£o";
}

function getQueryFilterLabel(query: AgentSpecificMovementQuery) {
  if (query.searchTerm) {
    return ` de ${query.searchTerm}`;
  }

  if (query.category) {
    return ` de ${query.category.toLocaleUpperCase("pt-BR")}`;
  }

  if (query.month) {
    return " no perÃ­odo pedido";
  }

  if (query.period) {
    return query.period === "this_week" ? " desta semana" : " deste mÃªs";
  }

  return "";
}

function getOrdinalLabel(ordinal: number) {
  if (ordinal === 2) {
    return "segunda";
  }

  if (ordinal === 3) {
    return "terceira";
  }

  return `${ordinal}Âª`;
}

function resolveSpecificMovementRange(query: AgentSpecificMovementQuery): AgentDateRange | null {
  const now = new Date();

  if (query.month) {
    const year = query.year ?? now.getFullYear();
    const start = new Date(year, query.month - 1, 1);
    const end = new Date(year, query.month, 0);
    return {
      end: toDateInputValue(end),
      start: toDateInputValue(start),
    };
  }

  if (query.period === "this_month") {
    const month = getCurrentMonthRange(now);
    return {
      end: month.end,
      start: month.start,
    };
  }

  if (query.period === "this_week") {
    const start = startOfWeek(now);
    const end = addDays(start, 6);
    return {
      end: toDateInputValue(end),
      start: toDateInputValue(start),
    };
  }

  return null;
}

function escapeIlikeValue(value: string) {
  return value.replace(/[%_]/g, "\\$&").trim();
}

function startOfWeek(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = start.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + offset);
  return start;
}

function addDays(date: Date, days: number) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

function getTargetLabel(target: TransactionTargetKind, type: "entrada" | "despesa") {
  if (target === "latest_expense") {
    return "despesa";
  }

  if (target === "latest_income") {
    return "entrada";
  }

  return type === "entrada" ? "movimentação" : "movimentação";
}

function summarizeMovements(movements: Array<{ amount: number; type: "entrada" | "despesa" }>) {
  return movements.reduce(
    (acc, movement) => {
      if (movement.type === "entrada") {
        acc.income += movement.amount;
      } else {
        acc.expense += movement.amount;
      }

      return acc;
    },
    { expense: 0, income: 0 },
  );
}

async function getInitialBalance(context: AgentExecutionContext) {
  const { data, error } = await context.supabase
    .from("profiles")
    .select("initial_balance")
    .eq("id", context.userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeInitialBalance(data);
}

function normalizeInitialBalance(profile: BalanceProfileRow | null) {
  const value = Number(profile?.initial_balance ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function getCashBalance(
  initialBalance: number,
  movements: Array<{ amount: number; type: "entrada" | "despesa" }>,
) {
  return movements.reduce((balance, movement) => {
    if (movement.type === "entrada") {
      return balance + movement.amount;
    }

    if (movement.type === "despesa") {
      return balance - movement.amount;
    }

    return balance;
  }, initialBalance);
}
