import type { AgentQuickPeriodQuery } from "@/lib/agent/types";
import { formatDisplayTextForWhatsApp } from "@/lib/agent/replies";
import { toCurrency, toDateInputValue } from "@/lib/agent/utils";

type MovementRow = {
  amount: number;
  category?: string | null;
  description?: string | null;
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
  const reportFormat = isPeriodReportQuestion(normalized);
  const range = parsePeriodRange(normalized);

  if (!isQuickPeriodQuestion(normalized) && !(range && reportFormat)) {
    return null;
  }

  const weeklyExtreme = parseWeeklyExtremeQuery(normalized);

  if (weeklyExtreme) {
    return weeklyExtreme;
  }

  const resolvedRange = range ?? (reportFormat ? { range: "this_month" as const } : null);

  if (!resolvedRange) {
    return null;
  }

  const metric = parsePeriodMetric(normalized) ?? (reportFormat ? "summary" : null);

  if (!metric) {
    return null;
  }

  return {
    ...resolvedRange,
    format: reportFormat ? "report" : undefined,
    metric,
    type: "period",
  };
}

export function resolveQuickPeriodRange(query: Extract<AgentQuickPeriodQuery, { type: "period" }>, now = new Date()): ResolvedRange {
  const referenceDate = getSaoPauloCalendarDate(now);

  if (query.range === "today") {
    const today = toDateInputValue(referenceDate);
    return { end: today, label: "hoje", prefix: "Hoje", start: today };
  }

  if (query.range === "yesterday") {
    const yesterday = addDays(referenceDate, -1);
    const value = toDateInputValue(yesterday);
    return { end: value, label: "ontem", prefix: "Ontem", start: value };
  }

  if (query.range === "this_week") {
    const start = startOfWeek(referenceDate);
    const end = endOfWeek(referenceDate);
    return {
      end: toDateInputValue(end),
      label: "nesta semana",
      prefix: "Nesta semana",
      start: toDateInputValue(start),
    };
  }

  if (query.range === "last_week") {
    const lastWeekDay = addDays(startOfWeek(referenceDate), -1);
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
    const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
    const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
    const label = formatMonthYear(referenceDate.getFullYear(), referenceDate.getMonth() + 1);
    return {
      end: toDateInputValue(end),
      label: `em ${label}`,
      prefix: `Em ${label}`,
      start: toDateInputValue(start),
    };
  }

  if (query.range === "last_month") {
    const date = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1);
    return resolveMonthRange(date.getFullYear(), date.getMonth() + 1);
  }

  if (query.range === "explicit_month" && query.month) {
    return resolveMonthRange(query.year ?? referenceDate.getFullYear(), query.month);
  }

  const days = Math.max(1, Math.min(query.days ?? 7, 31));
  const start = addDays(referenceDate, -(days - 1));
  const end = toDateInputValue(referenceDate);

  return {
    end,
    label: `nos últimos ${days} dias`,
    prefix: `Nos últimos ${days} dias`,
    start: toDateInputValue(start),
  };
}

export function getCurrentMonthWeeks(now = new Date()) {
  const referenceDate = getSaoPauloCalendarDate(now);
  const monthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const monthEnd = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
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

export function getSaoPauloCalendarDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
    year: "numeric",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? now.getFullYear());
  const month = Number(parts.find((part) => part.type === "month")?.value ?? now.getMonth() + 1);
  const day = Number(parts.find((part) => part.type === "day")?.value ?? now.getDate());

  return new Date(year, month - 1, day);
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

  if (query.format === "report") {
    return buildPeriodReportReply(range, rangeRows, totals, balance);
  }

  if (query.metric === "income") {
    if (totals.income <= 0) {
      return `Não encontrei entradas ${range.label}.`;
    }

    return `${range.prefix} entraram ${toCurrency(totals.income)}.`;
  }

  if (query.metric === "expense") {
    if (totals.expense <= 0) {
      return `Não encontrei despesas ${range.label}.`;
    }

    return `${range.prefix} saíram ${toCurrency(totals.expense)}.`;
  }

  if (rangeRows.length === 0) {
    return `Não encontrei movimentações ${range.label}.`;
  }

  if (query.metric === "balance") {
    return `${range.prefix} entraram ${toCurrency(totals.income)}, saíram ${toCurrency(totals.expense)} e o saldo ficou em ${toCurrency(balance)}.`;
  }

  return `${range.prefix}: entradas ${toCurrency(totals.income)}, despesas ${toCurrency(totals.expense)} e saldo ${toCurrency(balance)}.`;
}

export function buildWeeklyExtremeReply(query: Extract<AgentQuickPeriodQuery, { type: "weekly_extreme" }>, weeks: ResolvedRange[], rows: MovementRow[]) {
  const movementType = query.metric === "income" ? "entrada" : "despesa";
  const matchingRows = rows.filter((row) => row.type === movementType);

  if (matchingRows.length === 0) {
    return query.metric === "income"
      ? "Não encontrei entradas neste mês para comparar por semana."
      : "Não encontrei despesas neste mês para comparar por semana.";
  }

  const rankedWeeks = weeks.map((week) => {
    const total = filterMovementsByRange(matchingRows, week).reduce((sum, row) => sum + row.amount, 0);

    return { total, week };
  });
  const best = rankedWeeks.sort((a, b) => b.total - a.total)[0];

  if (!best || best.total <= 0) {
    return query.metric === "income"
      ? "Não encontrei entradas neste mês para comparar por semana."
      : "Não encontrei despesas neste mês para comparar por semana.";
  }

  return query.metric === "income"
    ? `A semana com mais entradas neste mês foi de ${best.week.label}, com ${toCurrency(best.total)}.`
    : `A semana em que você mais gastou neste mês foi de ${best.week.label}, com ${toCurrency(best.total)} em despesas.`;
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

  if (/\b(mes passado|ultimo mes|mes anterior)\b/.test(normalized)) {
    return { range: "last_month" };
  }

  const explicitMonth = parseExplicitMonthRange(normalized);

  if (explicitMonth) {
    return explicitMonth;
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

  if (/(essa semana|esta semana|nessa semana|nesta semana|minha semana|semana atual|relatorio semanal|resumo semanal|relatorio da semana|resumo da semana|\bsemanal\b)/.test(normalized)) {
    return { range: "this_week" };
  }

  if (/(este mes|esse mes|deste mes|desse mes|do mes|meu mes|minha movimentacao do mes|mes atual|neste mes|relatorio mensal|resumo mensal|\bmensal\b)/.test(normalized)) {
    return { range: "this_month" };
  }

  if (/(relatorio diario|resumo diario|\bdiari[oa]\b|relatorio do dia|resumo do dia)/.test(normalized)) {
    return { range: "today" };
  }

  return null;
}

function parsePeriodMetric(normalized: string): AgentQuickPeriodQuery["metric"] | null {
  if (/(como foi|como foram|resumo|relatorio|fechamento)/.test(normalized)) {
    return "summary";
  }

  if (/(sobrou|saldo|balance|lucro|lucrei|resultado)/.test(normalized)) {
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
  return /^(quanto|qual|como|total|resumo|relatorio|fechamento|mostra|mostre|me mostra|me fala|me faz|me faca|faz|faca|fazer|gera|gerar|mande|manda|me mande|me manda|envia|enviar|quero|preciso|gostaria)\b/.test(normalized);
}

function isPeriodReportQuestion(normalized: string) {
  return /\b(relatorio|fechamento)\b/.test(normalized);
}

function buildPeriodReportReply(
  range: ResolvedRange,
  rows: MovementRow[],
  totals: ReturnType<typeof summarizeMovementRows>,
  balance: number,
) {
  const incomeCount = rows.filter((row) => row.type === "entrada").length;
  const expenseCount = rows.filter((row) => row.type === "despesa").length;
  const topIncome = getTopMovement(rows, "entrada");
  const topExpense = getTopMovement(rows, "despesa");
  const topExpenseCategory = getTopCategory(rows, "despesa");
  const title = getPeriodReportTitle(range);

  if (rows.length === 0) {
    return [
      title,
      "",
      `Período: ${formatRangeDates(range)}`,
      "",
      `Não encontrei movimentações ${range.label}.`,
      "Assim que você registrar entradas ou despesas nesse período, eu monto o resumo por aqui.",
    ].join("\n");
  }

  return [
    title,
    "",
    `Período: ${formatRangeDates(range)}`,
    "",
    `✅ Entradas: ${toCurrency(totals.income)} (${incomeCount})`,
    `🔻 Despesas: ${toCurrency(totals.expense)} (${expenseCount})`,
    `💰 Resultado: ${toCurrency(balance)}`,
    "",
    `Movimentações registradas: ${rows.length}`,
    "",
    topIncome ? `Maior entrada: ${formatMovementHighlight(topIncome)}` : null,
    topExpense ? `Maior despesa: ${formatMovementHighlight(topExpense)}` : null,
    topExpenseCategory ? `Categoria com mais despesas: ${formatDisplayTextForWhatsApp(topExpenseCategory.category)} (${toCurrency(topExpenseCategory.total)})` : null,
    "",
    `Resumo: ${getPeriodBalanceSummary(range, balance)}`,
  ].filter((line): line is string => line !== null).join("\n");
}

function parseExplicitMonthRange(normalized: string): Omit<Extract<AgentQuickPeriodQuery, { type: "period" }>, "metric" | "type"> | null {
  const numericMonthYear = normalized.match(/\b(0?[1-9]|1[0-2])[\/.-](20\d{2})\b/);

  if (numericMonthYear) {
    return {
      month: Number(numericMonthYear[1]),
      range: "explicit_month",
      year: Number(numericMonthYear[2]),
    };
  }

  const numericYearMonth = normalized.match(/\b(20\d{2})[\/.-](0?[1-9]|1[0-2])\b/);

  if (numericYearMonth) {
    return {
      month: Number(numericYearMonth[2]),
      range: "explicit_month",
      year: Number(numericYearMonth[1]),
    };
  }

  for (const month of portugueseMonths) {
    const monthPattern = new RegExp(`\\b${month.normalized}\\b(?:\\s+(?:de\\s+)?(20\\d{2}))?`);
    const match = normalized.match(monthPattern);

    if (match) {
      return {
        month: month.value,
        range: "explicit_month",
        year: match[1] ? Number(match[1]) : undefined,
      };
    }
  }

  return null;
}

function getTopMovement(rows: MovementRow[], type: MovementRow["type"]) {
  return rows
    .filter((row) => row.type === type)
    .sort((left, right) => right.amount - left.amount)[0] ?? null;
}

function getTopCategory(rows: MovementRow[], type: MovementRow["type"]) {
  const totals = new Map<string, number>();

  for (const row of rows) {
    if (row.type !== type) {
      continue;
    }

    const category = row.category?.trim() || "Outros";
    totals.set(category, (totals.get(category) ?? 0) + row.amount);
  }

  return Array.from(totals.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((left, right) => right.total - left.total)[0] ?? null;
}

function resolveMonthRange(year: number, month: number): ResolvedRange {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  const label = formatMonthYear(year, month);

  return {
    end: toDateInputValue(end),
    label: `em ${label}`,
    prefix: `Em ${label}`,
    start: toDateInputValue(start),
  };
}

function formatMonthYear(year: number, month: number) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

const portugueseMonths = [
  { normalized: "janeiro", value: 1 },
  { normalized: "fevereiro", value: 2 },
  { normalized: "marco", value: 3 },
  { normalized: "abril", value: 4 },
  { normalized: "maio", value: 5 },
  { normalized: "junho", value: 6 },
  { normalized: "julho", value: 7 },
  { normalized: "agosto", value: 8 },
  { normalized: "setembro", value: 9 },
  { normalized: "outubro", value: 10 },
  { normalized: "novembro", value: 11 },
  { normalized: "dezembro", value: 12 },
];

function getPeriodReportTitle(range: ResolvedRange) {
  if (range.label.startsWith("em ")) {
    return `📊 Relatório de ${range.label.slice(3)}`;
  }

  return `📊 Relatório ${range.label}`;
}

function getPeriodBalanceSummary(range: ResolvedRange, balance: number) {
  const subject = getPeriodSummarySubject(range);

  if (balance > 0) {
    return `${subject} fechou positivo em ${toCurrency(balance)}.`;
  }

  if (balance < 0) {
    return `${subject} fechou negativo em ${toCurrency(Math.abs(balance))}.`;
  }

  return `${subject} fechou no zero a zero.`;
}

function getPeriodSummarySubject(range: ResolvedRange) {
  if (!range.label.startsWith("em ")) {
    return range.label;
  }

  const [month] = range.label.slice(3).split(" de ");
  return month || "o período";
}

function formatMovementHighlight(row: MovementRow) {
  const description = formatDisplayTextForWhatsApp(row.description, "Sem descrição");

  return `${toCurrency(row.amount)} — ${description}`;
}

function formatRangeDates(range: Pick<ResolvedRange, "end" | "start">) {
  return range.start === range.end
    ? formatDate(range.start)
    : `${formatDate(range.start)} a ${formatDate(range.end)}`;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
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
