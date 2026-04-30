import { buildImportDuplicateKey } from "@/lib/import/dedupe";
import type {
  ImportColumnKey,
  ImportColumnMap,
  ImportMovementType,
  ImportPreviewRow,
  ImportSummary,
  RawImportRow,
} from "@/lib/import/types";

const columnAliases: Record<ImportColumnKey, string[]> = {
  amount: ["valor", "valor total", "total", "amount", "quantia", "saldo movimentado", "valor movimentado"],
  category: ["categoria", "category", "grupo", "tipo categoria", "classificacao", "classificação"],
  credit: ["credito", "crédito", "crdito", "credit", "entrada", "receita"],
  date: [
    "data",
    "date",
    "dt",
    "dt.",
    "dt movimento",
    "dt. movimento",
    "data movimento",
    "data da movimentacao",
    "data da movimentação",
    "movimento",
    "competencia",
    "competência",
  ],
  debit: ["debito", "débito", "dbito", "debit", "saida", "saída", "despesa"],
  description: [
    "descricao",
    "descrição",
    "descrio",
    "description",
    "historico",
    "histórico",
    "histrico",
    "lancamento",
    "lançamento",
    "lanamento",
    "lançamentos",
    "detalhes",
    "detalhe",
    "nome",
    "transacao",
    "transação",
    "transao",
  ],
  notes: ["observacao", "observação", "observacoes", "observações", "observaes", "nota", "notas", "memo"],
  type: ["tipo", "type", "entrada_saida", "entrada/saida", "entrada saida"],
};

const defaultCategories = [
  "CLIENTE",
  "SERVICO",
  "VENDA",
  "MATERIAL",
  "FERRAMENTA",
  "IMPOSTO",
  "TRANSPORTE",
  "ALIMENTACAO",
  "OUTRO",
];

export function detectImportColumns(headers: string[]): ImportColumnMap {
  const normalizedHeaders = headers.map((header) => ({
    compact: normalizeHeader(header).replace(/_/g, ""),
    normalized: normalizeHeader(header),
    original: header,
  }));
  const map: ImportColumnMap = {};

  (Object.keys(columnAliases) as ImportColumnKey[]).forEach((key) => {
    const aliases = columnAliases[key].map(normalizeHeader);
    const compactAliases = aliases.map((alias) => alias.replace(/_/g, ""));
    const match = normalizedHeaders.find(
      (header) => aliases.includes(header.normalized) || compactAliases.includes(header.compact),
    );

    if (match) {
      map[key] = match.original;
    }
  });

  return map;
}

export function normalizeImportRows(rawRows: RawImportRow[], columnMap: ImportColumnMap) {
  const fileKeys = new Set<string>();

  return rawRows.map((raw, index) => {
    const row = normalizeImportRow(raw, columnMap, index + 2);

    if (row.duplicateKey && row.status === "valid") {
      if (fileKeys.has(row.duplicateKey)) {
        row.status = "duplicate_file";
        row.errors.push("Duplicado dentro do arquivo.");
      } else {
        fileKeys.add(row.duplicateKey);
      }
    }

    return row;
  });
}

export function summarizeImportRows(rows: ImportPreviewRow[]): ImportSummary {
  return rows.reduce(
    (summary, row) => {
      summary.totalRows += 1;

      if (row.status === "error") {
        summary.errorCount += 1;
      }

      if (row.status === "duplicate_file") {
        summary.duplicateFileCount += 1;
      }

      if (row.status === "duplicate_existing") {
        summary.duplicateExistingCount += 1;
      }

      if (row.status === "valid") {
        summary.importableCount += 1;

        if (row.type === "entrada" && row.amount) {
          summary.incomeCount += 1;
          summary.incomeAmount += row.amount;
        }

        if (row.type === "despesa" && row.amount) {
          summary.expenseCount += 1;
          summary.expenseAmount += row.amount;
        }
      }

      return summary;
    },
    {
      duplicateExistingCount: 0,
      duplicateFileCount: 0,
      errorCount: 0,
      expenseAmount: 0,
      expenseCount: 0,
      importableCount: 0,
      incomeAmount: 0,
      incomeCount: 0,
      totalRows: 0,
    },
  );
}

export function markExistingDuplicates(rows: ImportPreviewRow[], duplicateKeys: string[]) {
  const duplicates = new Set(duplicateKeys);

  return rows.map((row) => {
    if (row.status !== "valid" || !row.duplicateKey || !duplicates.has(row.duplicateKey)) {
      return row;
    }

    return {
      ...row,
      errors: [...row.errors, "Possivel duplicado ja existente no app."],
      status: "duplicate_existing" as const,
    };
  });
}

export function getImportableRows(rows: ImportPreviewRow[]) {
  return rows
    .filter((row) => row.status === "valid" && row.amount && row.description && row.duplicateKey && row.occurred_on && row.type)
    .map((row) => ({
      amount: row.amount!,
      category: row.category,
      description: row.description,
      duplicateKey: row.duplicateKey!,
      occurred_on: row.occurred_on!,
      type: row.type!,
    }));
}

export function hasRequiredColumns(columnMap: ImportColumnMap) {
  return Boolean(columnMap.date && columnMap.description && (columnMap.amount || columnMap.credit || columnMap.debit));
}

export function getMissingRequiredColumns(columnMap: ImportColumnMap) {
  const missing: string[] = [];

  if (!columnMap.date) {
    missing.push("Data");
  }

  if (!columnMap.description) {
    missing.push("Descricao");
  }

  if (!columnMap.amount && !columnMap.credit && !columnMap.debit) {
    missing.push("Valor ou Credito/Debito");
  }

  return missing;
}

function normalizeImportRow(raw: RawImportRow, columnMap: ImportColumnMap, rowNumber: number): ImportPreviewRow {
  const errors: string[] = [];
  const rawDate = readColumn(raw, columnMap.date);
  const rawDescription = readColumn(raw, columnMap.description);
  const rawAmount = readColumn(raw, columnMap.amount);
  const rawCredit = readColumn(raw, columnMap.credit);
  const rawDebit = readColumn(raw, columnMap.debit);
  const rawType = readColumn(raw, columnMap.type);
  const rawCategory = readColumn(raw, columnMap.category);
  const occurred_on = parseImportDate(rawDate);
  const amountInfo = resolveSignedAmount({ rawAmount, rawCredit, rawDebit });
  const signedAmount = amountInfo.signedAmount;
  const description = rawDescription.trim().replace(/\s+/g, " ");
  const type = amountInfo.type ?? inferType(rawType, signedAmount);
  const amount = signedAmount === null ? null : Math.abs(signedAmount);
  const category = normalizeCategory(rawCategory || inferCategory(description));

  if (!occurred_on) {
    errors.push("Data invalida.");
  }

  if (!description) {
    errors.push("Descricao vazia.");
  }

  if (signedAmount === null) {
    errors.push("Valor invalido.");
  } else if (signedAmount === 0) {
    errors.push("Valor precisa ser diferente de zero.");
  }

  if (amountInfo.error) {
    errors.push(amountInfo.error);
  }

  if (!amountInfo.type && rawType && !type) {
    errors.push("Tipo invalido.");
  }

  const duplicateKey =
    occurred_on && description && amount && type
      ? buildImportDuplicateKey({ amount, description, occurred_on, type })
      : null;

  return {
    amount,
    category,
    description,
    duplicateKey,
    errors,
    id: `row-${rowNumber}`,
    occurred_on,
    raw,
    rowNumber,
    signedAmount,
    status: errors.length > 0 ? "error" : "valid",
    type,
  };
}

function readColumn(row: RawImportRow, column?: string) {
  if (!column) {
    return "";
  }

  return String(row[column] ?? "").trim();
}

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseImportDate(value: string) {
  const trimmed = value.trim();
  let year: number;
  let month: number;
  let day: number;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    [year, month, day] = trimmed.split("-").map(Number);
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    [day, month, year] = trimmed.split("/").map(Number);
  } else if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
    [day, month, year] = trimmed.split("-").map(Number);
  } else {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseImportAmount(value: string) {
  const trimmed = value
    .replace(/R\$/gi, "")
    .replace(/\s+/g, "")
    .trim();

  if (!trimmed) {
    return null;
  }

  const negative = trimmed.startsWith("-") || /^\(.+\)$/.test(trimmed);
  const unsigned = trimmed.replace(/[()+-]/g, "");
  const lastComma = unsigned.lastIndexOf(",");
  const lastDot = unsigned.lastIndexOf(".");
  const decimalSeparator = lastComma > lastDot ? "," : lastDot > -1 ? "." : "";
  const normalized =
    decimalSeparator === ","
      ? unsigned.replace(/\./g, "").replace(",", ".")
      : decimalSeparator === "."
        ? unsigned.replace(/,/g, "")
        : unsigned;
  const amount = Number(normalized);

  if (!Number.isFinite(amount)) {
    return null;
  }

  return negative ? amount * -1 : amount;
}

function resolveSignedAmount({
  rawAmount,
  rawCredit,
  rawDebit,
}: {
  rawAmount: string;
  rawCredit: string;
  rawDebit: string;
}) {
  const creditAmount = parseImportAmount(rawCredit);
  const debitAmount = parseImportAmount(rawDebit);
  const fallbackAmount = parseImportAmount(rawAmount);
  const hasCredit = rawCredit.trim() !== "" && creditAmount !== null && creditAmount !== 0;
  const hasDebit = rawDebit.trim() !== "" && debitAmount !== null && debitAmount !== 0;

  if (hasCredit && !hasDebit) {
    return {
      signedAmount: Math.abs(creditAmount),
      type: "entrada" as const,
    };
  }

  if (hasDebit && !hasCredit) {
    return {
      signedAmount: Math.abs(debitAmount) * -1,
      type: "despesa" as const,
    };
  }

  if (hasCredit && hasDebit) {
    return {
      error: "Credito e debito preenchidos na mesma linha.",
      signedAmount: fallbackAmount,
      type: null,
    };
  }

  return {
    signedAmount: fallbackAmount,
    type: null,
  };
}

function inferType(rawType: string, amount: number | null): ImportMovementType | null {
  const normalized = normalizeHeader(rawType);

  if (["entrada", "receita", "credito", "credit", "income"].includes(normalized)) {
    return "entrada";
  }

  if (["despesa", "saida", "debito", "debit", "expense"].includes(normalized)) {
    return "despesa";
  }

  if (rawType.trim()) {
    return null;
  }

  if (amount === null) {
    return null;
  }

  return amount < 0 ? "despesa" : "entrada";
}

function normalizeCategory(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
  return normalized || "OUTRO";
}

function inferCategory(description: string) {
  const normalized = normalizeHeader(description);

  if (/das|imposto|simples/.test(normalized)) {
    return "IMPOSTO";
  }

  if (/uber|99|combustivel|transporte|onibus/.test(normalized)) {
    return "TRANSPORTE";
  }

  if (/alimentacao|hamburguer|restaurante|lanche|mercado|cafe/.test(normalized)) {
    return "ALIMENTACAO";
  }

  if (/internet|software|ferramenta|assinatura|meta|ads|trafego/.test(normalized)) {
    return "SERVICO";
  }

  if (/cliente|venda|servico|consultoria|projeto/.test(normalized)) {
    return "CLIENTE";
  }

  return defaultCategories.at(-1) ?? "OUTRO";
}
