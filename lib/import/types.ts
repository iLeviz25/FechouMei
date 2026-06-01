export type ImportMovementType = "entrada" | "despesa";

export type ImportColumnKey = "amount" | "category" | "credit" | "date" | "debit" | "description" | "notes" | "type";

export type ImportColumnMap = Partial<Record<ImportColumnKey, string>>;

export type RawImportRow = Record<string, string>;

export type ImportRowStatus = "duplicate_existing" | "duplicate_file" | "error" | "valid";

export type ImportPreviewRow = {
  amount: number | null;
  category: string;
  description: string;
  duplicateKey: string | null;
  errors: string[];
  id: string;
  occurred_on: string | null;
  raw: RawImportRow;
  rowNumber: number;
  signedAmount: number | null;
  status: ImportRowStatus;
  type: ImportMovementType | null;
};

export type ImportSummary = {
  duplicateExistingCount: number;
  duplicateFileCount: number;
  errorCount: number;
  expenseAmount: number;
  expenseCount: number;
  incomeAmount: number;
  incomeCount: number;
  importableCount: number;
  totalRows: number;
};

export type ImportParseResult = {
  columnMap: ImportColumnMap;
  fileName: string;
  rows: ImportPreviewRow[];
  summary: ImportSummary;
};

export type ImportableMovement = {
  amount: number;
  category: string;
  description: string;
  duplicateKey: string;
  occurred_on: string;
  type: ImportMovementType;
};
