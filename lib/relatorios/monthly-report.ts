import { getMeiLimitInfo, MEI_ANNUAL_LIMIT } from "@/lib/mei-limit";
import { getCurrentUserProfile } from "@/lib/profile";
import type {
  MonthlyReportData,
  ReportCategorySummary,
  ReportMovement,
  ReportObligationSummary,
} from "@/lib/relatorios/types";

const CHECKLIST_TEMPLATE = [
  "conferir-entradas",
  "conferir-despesas",
  "revisar-fechamento",
  "pagar-das",
  "entregar-dasn",
  "guardar-comprovantes",
] as const;

type ChecklistKey = (typeof CHECKLIST_TEMPLATE)[number];

type ChecklistRow = {
  done: boolean;
  item_key: string;
};

type ReportMonth = {
  date: Date;
  endDate: Date;
  monthKey: string;
  startDate: Date;
  value: string;
};

export async function getMonthlyReportData(monthParam?: string): Promise<MonthlyReportData> {
  const { profile, profileError, supabase, user } = await getCurrentUserProfile();

  if (!user) {
    throw new Error("Usuario nao autenticado.");
  }

  if (profileError) {
    throw new Error(`Erro ao carregar perfil: ${profileError.message}`);
  }

  const selectedMonth = resolveReportMonth(monthParam);
  const yearStartValue = `${selectedMonth.date.getFullYear()}-01-01`;
  const yearEndValue = `${selectedMonth.date.getFullYear()}-12-31`;

  const [monthMovementsResult, yearMovementsResult, checklistResult] = await Promise.all([
    supabase
      .from("movimentacoes")
      .select("id, type, description, amount, occurred_on, occurred_at, category")
      .eq("user_id", user.id)
      .gte("occurred_on", toDateInputValue(selectedMonth.startDate))
      .lte("occurred_on", toDateInputValue(selectedMonth.endDate))
      .order("occurred_on", { ascending: true })
      .order("occurred_at", { ascending: true }),
    supabase
      .from("movimentacoes")
      .select("type, amount, occurred_on")
      .eq("user_id", user.id)
      .gte("occurred_on", yearStartValue)
      .lte("occurred_on", yearEndValue),
    supabase
      .from("obrigacoes_checklist")
      .select("item_key, done")
      .eq("user_id", user.id)
      .eq("month", selectedMonth.monthKey),
  ]);

  if (monthMovementsResult.error) {
    throw new Error(`Erro ao carregar movimentacoes do relatorio: ${monthMovementsResult.error.message}`);
  }

  if (yearMovementsResult.error) {
    throw new Error(`Erro ao carregar faturamento anual: ${yearMovementsResult.error.message}`);
  }

  if (checklistResult.error) {
    throw new Error(`Erro ao carregar obrigacoes do relatorio: ${checklistResult.error.message}`);
  }

  const movements = (monthMovementsResult.data ?? []) as ReportMovement[];
  const totalIncome = sumMovements(movements, "entrada");
  const totalExpense = sumMovements(movements, "despesa");
  const incomeCount = countMovements(movements, "entrada");
  const expenseCount = countMovements(movements, "despesa");
  const annualIncome = (yearMovementsResult.data ?? []).reduce(
    (total, movement) => (movement.type === "entrada" ? total + Number(movement.amount ?? 0) : total),
    0,
  );
  const meiLimit = getMeiLimitInfo(annualIncome);

  return {
    categories: {
      despesas: buildCategorySummary(movements, "despesa", totalExpense),
      entradas: buildCategorySummary(movements, "entrada", totalIncome),
    },
    identification: {
      businessMode: profile?.business_mode ?? null,
      email: user.email ?? null,
      fullName: profile?.full_name ?? null,
      mainCategory: profile?.main_category ?? null,
      monthLabel: formatMonthLabel(selectedMonth.date),
      monthValue: selectedMonth.value,
      workType: profile?.work_type ?? null,
    },
    meiLimit: {
      ...meiLimit,
      limit: MEI_ANNUAL_LIMIT,
    },
    movements,
    obligations: buildObligationSummary((checklistResult.data ?? []) as ChecklistRow[]),
    summary: {
      balance: totalIncome - totalExpense,
      expenseCount,
      incomeCount,
      totalExpense,
      totalIncome,
      totalMovements: movements.length,
    },
  };
}

export function resolveReportMonth(monthParam?: string): ReportMonth {
  const date = parseMonthParam(monthParam) ?? new Date();
  const monthDate = new Date(date.getFullYear(), date.getMonth(), 1);
  const startDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const endDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const value = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;

  return {
    date: monthDate,
    endDate,
    monthKey: value,
    startDate,
    value,
  };
}

function parseMonthParam(monthParam?: string) {
  if (!monthParam || !/^\d{4}-\d{2}$/.test(monthParam)) {
    return null;
  }

  const [year, month] = monthParam.split("-").map(Number);

  if (!year || !month || month < 1 || month > 12) {
    return null;
  }

  return new Date(year, month - 1, 1);
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function sumMovements(movements: ReportMovement[], type: ReportMovement["type"]) {
  return movements.reduce((total, movement) => {
    return movement.type === type ? total + Number(movement.amount ?? 0) : total;
  }, 0);
}

function countMovements(movements: ReportMovement[], type: ReportMovement["type"]) {
  return movements.filter((movement) => movement.type === type).length;
}

function buildCategorySummary(
  movements: ReportMovement[],
  type: ReportMovement["type"],
  totalByType: number,
): ReportCategorySummary[] {
  const categoryMap = new Map<string, { count: number; total: number }>();

  for (const movement of movements) {
    if (movement.type !== type) {
      continue;
    }

    const category = movement.category || "Outros";
    const previous = categoryMap.get(category) ?? { count: 0, total: 0 };

    categoryMap.set(category, {
      count: previous.count + 1,
      total: previous.total + Number(movement.amount ?? 0),
    });
  }

  return Array.from(categoryMap.entries())
    .map(([category, values]) => ({
      category,
      count: values.count,
      percent: totalByType > 0 ? (values.total / totalByType) * 100 : 0,
      total: values.total,
      type,
    }))
    .sort((first, second) => second.total - first.total);
}

function buildObligationSummary(rows: ChecklistRow[]): MonthlyReportData["obligations"] {
  const doneMap = new Map<ChecklistKey, boolean>();

  for (const key of CHECKLIST_TEMPLATE) {
    doneMap.set(key, false);
  }

  for (const row of rows) {
    if (CHECKLIST_TEMPLATE.includes(row.item_key as ChecklistKey)) {
      doneMap.set(row.item_key as ChecklistKey, Boolean(row.done));
    }
  }

  const revisionDone =
    Boolean(doneMap.get("conferir-entradas")) &&
    Boolean(doneMap.get("conferir-despesas")) &&
    Boolean(doneMap.get("revisar-fechamento"));

  const items: ReportObligationSummary[] = [
    toObligationItem("das", "DAS mensal", Boolean(doneMap.get("pagar-das"))),
    toObligationItem("dasn", "DASN-SIMEI", Boolean(doneMap.get("entregar-dasn"))),
    toObligationItem("revisao", "Revisao mensal", revisionDone),
    toObligationItem("comprovantes", "Comprovantes", Boolean(doneMap.get("guardar-comprovantes"))),
  ];
  const totalDone = CHECKLIST_TEMPLATE.reduce((total, key) => total + (doneMap.get(key) ? 1 : 0), 0);

  return {
    items,
    totalDone,
    totalPending: CHECKLIST_TEMPLATE.length - totalDone,
  };
}

function toObligationItem(
  key: ReportObligationSummary["key"],
  label: string,
  done: boolean,
): ReportObligationSummary {
  return {
    done,
    key,
    label,
    statusLabel: done ? "Concluido" : "Pendente",
  };
}
