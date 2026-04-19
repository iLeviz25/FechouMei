import type { AgentQuickPeriodQuery } from "@/lib/agent/types";
import { toCurrency, toDateInputValue } from "@/lib/agent/utils";

type MovementRow = {
  amount: number;
  occurred_on: string;
  type: "entrada" | "despesa";
};

type ResolvedRange = {
  end: string;
  label: string;
  prefix: string;
  start: string;
};

export function parseQuickPeriodQuery(normalized: string): AgentQuickPeriodQuery | null {
  if (!isQuickPeriodQuestion(normalized)) {
    return null;
  }

  const weeklyExtreme = parseWeeklyExtremeQuery(normalized);

  if (weeklyExtreme) {
    return weeklyExtreme;
  }

  const range = parsePeriodRange(normalized);

  if (!range) {
    return null;
  }

  const metric = parsePeriodMetric(normalized);

  if (!metric) {
    return null;
  }

  return {
    ...range,
    metric,
    type: "period",
  };
}

export function resolveQuickPeriodRange(query: Extract<AgentQuickPeriodQuery, { type: "period" }>, now = new Date()): ResolvedRange {
  if (query.range === "today") {
    const today = toDateInputValue(now);
    return { end: today, label: "hoje", prefix: "Hoje", start: today };
  }

  if (query.range === "yesterday") {
    const yesterday = addDays(now, -1);
    const value = toDateInputValue(yesterday);
    return { end: value, label: "ontem", prefix: "Ontem", start: value };
  }

  if (query.range === "this_week") {
    const start = startOfWeek(now);
    const end = endOfWeek(now);
    return {
      end: toDateInputValue(end),
      label: "nesta semana",
      prefix: "Nesta semana",
      start: toDateInputValue(start),
    };
  }

  if (query.range === "last_week") {
    const lastWeekDay = addDays(startOfWeek(now), -1);
    const start = startOfWeek(lastWeekDay);
    const end = endOfWeek(lastWeekDay);
    return {
      end: toDateInputValue(end),
      label: "na semana passada",
      prefix: "Na semana passada",
      start: toDateInputValue(start),
    };
  }

  if (query.range === "this_month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      end: toDateInputValue(end),
      label: "neste mes",
      prefix: "Neste mes",
      start: toDateInputValue(start),
    };
  }

  const days = Math.max(1, Math.min(query.days ?? 7, 31));
  const start = addDays(now, -(days - 1));
  const end = toDateInputValue(now);

  return {
    end,
    label: `nos ultimos ${days} dias`,
    prefix: `Nos ultimos ${days} dias`,
    start: toDateInputValue(start),
  };
}

export function getCurrentMonthWeeks(now = new Date()) {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const weeks: ResolvedRange[] = [];
  let cursor = startOfWeek(monthStart);

  while (cursor <= monthEnd) {
    const rawEnd = endOfWeek(cursor);
    const start = cursor < monthStart ? monthStart : cursor;
    const end = rawEnd > monthEnd ? monthEnd : rawEnd;

    weeks.push({
      end: toDateInputValue(end),
      label: `${formatShortDate(start)} a ${formatShortDate(end)}`,
      prefix: "",
      start: toDateInputValue(start),
    });

    cursor = addDays(rawEnd, 1);
  }

  return weeks;
}

export function filterMovementsByRange(rows: MovementRow[], range: Pick<ResolvedRange, "end" | "start">) {
  return rows.filter((row) => row.occurred_on >= range.start && row.occurred_on <= range.end);
}

export function summarizeMovementRows(rows: MovementRow[]) {
  return rows.reduce(
    (acc, row) => {
      if (row.type === "entrada") {
        acc.income += row.amount;
      } else {
        acc.expense += row.amount;
      }

      return acc;
    },
    { expense: 0, income: 0 },
  );
}

export function buildQuickPeriodReply(query: Extract<AgentQuickPeriodQuery, { type: "period" }>, range: ResolvedRange, rows: MovementRow[]) {
  const rangeRows = filterMovementsByRange(rows, range);
  const totals = summarizeMovementRows(rangeRows);
  const balance = totals.income - totals.expense;

  if (query.metric === "income") {
    if (totals.income <= 0) {
      return `Nao encontrei entradas ${range.label}.`;
    }

    return `${range.prefix} entraram ${toCurrency(totals.income)}.`;
  }

  if (query.metric === "expense") {
    if (totals.expense <= 0) {
      return `Nao encontrei despesas ${range.label}.`;
    }

    return `${range.prefix} sairam ${toCurrency(totals.expense)}.`;
  }

  if (rangeRows.length === 0) {
    return `Nao encontrei movimentacoes ${range.label}.`;
  }

  if (query.metric === "balance") {
    return `${range.prefix} entraram ${toCurrency(totals.income)}, sairam ${toCurrency(totals.expense)} e o saldo ficou em ${toCurrency(balance)}.`;
  }

  return `${range.prefix}: entradas ${toCurrency(totals.income)}, despesas ${toCurrency(totals.expense)} e saldo ${toCurrency(balance)}.`;
}

export function buildWeeklyExtremeReply(query: Extract<AgentQuickPeriodQuery, { type: "weekly_extreme" }>, weeks: ResolvedRange[], rows: MovementRow[]) {
  const movementType = query.metric === "income" ? "entrada" : "despesa";
  const matchingRows = rows.filter((row) => row.type === movementType);

  if (matchingRows.length === 0) {
    return query.metric === "income"
      ? "Nao encontrei entradas neste mes para comparar por semana."
      : "Nao encontrei despesas neste mes para comparar por semana.";
  }

  const rankedWeeks = weeks.map((week) => {
    const total = filterMovementsByRange(matchingRows, week).reduce((sum, row) => sum + row.amount, 0);

    return { total, week };
  });
  const best = rankedWeeks.sort((a, b) => b.total - a.total)[0];

  if (!best || best.total <= 0) {
    return query.metric === "income"
      ? "Nao encontrei entradas neste mes para comparar por semana."
      : "Nao encontrei despesas neste mes para comparar por semana.";
  }

  return query.metric === "income"
    ? `A semana com mais entradas neste mes foi de ${best.week.label}, com ${toCurrency(best.total)}.`
    : `A semana em que voce mais gastou neste mes foi de ${best.week.label}, com ${toCurrency(best.total)} em despesas.`;
}

function parseWeeklyExtremeQuery(normalized: string): AgentQuickPeriodQuery | null {
  if (!/semana/.test(normalized) || !/(mes|mês|neste mes|este mes)/.test(normalized)) {
    return null;
  }

  if (/(mais gastei|gastei mais|mais gastou|mais gasto|mais despesa|mais pesada|pior)/.test(normalized)) {
    return { metric: "expense", type: "weekly_extreme" };
  }

  if (/(entrou mais|mais entrou|mais entrada|mais dinheiro|entrou mais dinheiro)/.test(normalized)) {
    return { metric: "income", type: "weekly_extreme" };
  }

  return null;
}

function parsePeriodRange(normalized: string): Omit<Extract<AgentQuickPeriodQuery, { type: "period" }>, "metric" | "type"> | null {
  const lastDays = normalized.match(/ultim[oa]s?\s+(\d{1,2})\s+dias/);

  if (lastDays?.[1]) {
    return { days: Number(lastDays[1]), range: "last_days" };
  }

  if (/\bhoje\b/.test(normalized)) {
    return { range: "today" };
  }

  if (/\bontem\b/.test(normalized)) {
    return { range: "yesterday" };
  }

  if (/semana passada/.test(normalized)) {
    return { range: "last_week" };
  }

  if (/(essa semana|esta semana|nessa semana|nesta semana|minha semana|semana atual)/.test(normalized)) {
    return { range: "this_week" };
  }

  if (/(este mes|esse mes|mes atual|neste mes)/.test(normalized)) {
    return { range: "this_month" };
  }

  return null;
}

function parsePeriodMetric(normalized: string): AgentQuickPeriodQuery["metric"] | null {
  if (/(como foi|como foram|resumo)/.test(normalized)) {
    return "summary";
  }

  if (/(sobrou|saldo|balance)/.test(normalized)) {
    return "balance";
  }

  if (/(entrou|entrada|entradas|recebi|receita|receitas|faturou|faturei)/.test(normalized)) {
    return "income";
  }

  if (/(saiu|despesa|despesas|gastei|gasto|gastos|paguei|pagamento)/.test(normalized)) {
    return "expense";
  }

  return null;
}

function isQuickPeriodQuestion(normalized: string) {
  return /^(quanto|qual|como|total|resumo|mostra|mostre|me mostra|me fala)\b/.test(normalized);
}

function startOfWeek(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = start.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + offset);
  return start;
}

function endOfWeek(date: Date) {
  return addDays(startOfWeek(date), 6);
}

function addDays(date: Date, days: number) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

function formatShortDate(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}
