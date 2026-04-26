import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type TransactionCsvMovement = {
  amount: number;
  category: string | null;
  created_at?: string | null;
  description: string;
  occurred_at?: string | null;
  occurred_on: string;
  source?: string | null;
  type: "entrada" | "despesa" | string;
};

export type TransactionCsvPeriod = {
  endDate: string;
  month: number;
  startDate: string;
  year: number;
};

export type TransactionCsvExport = {
  csv: string;
  fileName: string;
  movements: TransactionCsvMovement[];
  period: TransactionCsvPeriod;
};

type GetTransactionCsvExportParameters = {
  period: TransactionCsvPeriod;
  supabase: SupabaseClient<Database>;
  typeFilter?: "entrada" | "despesa" | "todos";
  userId: string;
};

const csvSeparator = ";";
const csvBom = "\uFEFF";

const columns = [
  { header: "data", value: (movement: TransactionCsvMovement) => movement.occurred_on },
  { header: "descricao", value: (movement: TransactionCsvMovement) => movement.description },
  { header: "tipo", value: (movement: TransactionCsvMovement) => movement.type },
  { header: "categoria", value: (movement: TransactionCsvMovement) => movement.category ?? "" },
  { header: "valor", value: (movement: TransactionCsvMovement) => formatCsvAmount(movement.amount) },
  { header: "origem", value: (movement: TransactionCsvMovement) => movement.source ?? "" },
  { header: "criado_em", value: (movement: TransactionCsvMovement) => movement.created_at ?? "" },
];

export function buildTransactionsCsv(movements: readonly TransactionCsvMovement[]) {
  const header = columns.map((column) => escapeCsvCell(column.header)).join(csvSeparator);
  const rows = movements.map((movement) =>
    columns.map((column) => escapeCsvCell(column.value(movement))).join(csvSeparator),
  );

  return [header, ...rows].join("\r\n");
}

export function withCsvBom(csv: string) {
  return csv.startsWith(csvBom) ? csv : `${csvBom}${csv}`;
}

export function buildTransactionsCsvFileName(period: Pick<TransactionCsvPeriod, "month" | "year">) {
  return `fechoumei-movimentacoes-${period.year}-${String(period.month).padStart(2, "0")}.csv`;
}

export function buildTransactionCsvPeriod(year: number, month: number): TransactionCsvPeriod {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

  return {
    endDate,
    month,
    startDate,
    year,
  };
}

export async function getTransactionCsvExport({
  period,
  supabase,
  typeFilter = "todos",
  userId,
}: GetTransactionCsvExportParameters): Promise<TransactionCsvExport> {
  let query = supabase
    .from("movimentacoes")
    .select("amount, category, created_at, description, occurred_at, occurred_on, type")
    .eq("user_id", userId)
    .gte("occurred_on", period.startDate)
    .lte("occurred_on", period.endDate)
    .order("occurred_on", { ascending: true })
    .order("occurred_at", { ascending: true });

  if (typeFilter === "entrada" || typeFilter === "despesa") {
    query = query.eq("type", typeFilter);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Nao foi possivel buscar movimentacoes para exportacao: ${error.message}`);
  }

  const movements = (data ?? []).map((movement) => ({
    amount: Number(movement.amount) || 0,
    category: movement.category,
    created_at: movement.created_at,
    description: movement.description,
    occurred_at: movement.occurred_at,
    occurred_on: movement.occurred_on,
    source: "",
    type: movement.type,
  }));

  return {
    csv: buildTransactionsCsv(movements),
    fileName: buildTransactionsCsvFileName(period),
    movements,
    period,
  };
}

function formatCsvAmount(value: number) {
  return Number.isFinite(value) ? value.toFixed(2).replace(".", ",") : "0,00";
}

function escapeCsvCell(value: string) {
  const safeValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replace(/"/g, '""')}"`;
}
