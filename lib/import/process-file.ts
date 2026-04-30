import { getImportableRows, getMissingRequiredColumns, hasRequiredColumns, markExistingDuplicates, normalizeImportRows, summarizeImportRows, detectImportColumns } from "@/lib/import/normalize-import-row";
import { parseCsv } from "@/lib/import/parse-csv";
import { parseXlsx } from "@/lib/import/parse-xlsx";
import { getExistingImportDuplicateKeys, type ImportPersistenceClient } from "@/lib/import/persistence";
import type { ImportColumnMap, ImportParseResult, ImportPreviewRow, RawImportRow } from "@/lib/import/types";

export type ImportFileKind = "csv" | "xlsx";

const supportedCsvMimeTypes = new Set(["text/csv", "application/csv", "application/vnd.ms-excel", "text/plain"]);
const supportedXlsxMimeTypes = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel.sheet.macroenabled.12",
]);

export class UnsupportedImportFileError extends Error {
  constructor(message = "Formato nao suportado. Envie um arquivo CSV ou XLSX.") {
    super(message);
    this.name = "UnsupportedImportFileError";
  }
}

export async function processImportFileForPreview({
  buffer,
  fileName,
  fileType,
  supabase,
  userId,
}: {
  buffer: Buffer;
  fileName: string;
  fileType?: string | null;
  supabase: ImportPersistenceClient;
  userId: string;
}): Promise<ImportParseResult> {
  const kind = resolveImportFileKind({ fileName, fileType });
  const rawRows = parseImportBuffer(buffer, kind);
  const headers = getHeaders(rawRows);
  const columnMap = detectImportColumns(headers);

  if (!hasRequiredColumns(columnMap)) {
    return buildParseResult(fileName, columnMap, buildMissingMappingRows(rawRows, columnMap));
  }

  const normalizedRows = normalizeImportRows(rawRows, columnMap);
  const importableRows = getImportableRows(normalizedRows);

  if (importableRows.length === 0) {
    return buildParseResult(fileName, columnMap, normalizedRows);
  }

  const existingDuplicateKeys = await getExistingImportDuplicateKeys({
    rows: importableRows,
    supabase,
    userId,
  });

  const rowsWithExistingDuplicates = markExistingDuplicates(normalizedRows, Array.from(existingDuplicateKeys));

  return buildParseResult(fileName, columnMap, rowsWithExistingDuplicates);
}

export function resolveImportFileKind({
  fileName,
  fileType,
}: {
  fileName?: string | null;
  fileType?: string | null;
}): ImportFileKind {
  const normalizedName = fileName?.trim().toLowerCase() ?? "";
  const normalizedType = fileType?.split(";")[0]?.trim().toLowerCase() ?? "";

  if (normalizedName.endsWith(".csv") || supportedCsvMimeTypes.has(normalizedType)) {
    return "csv";
  }

  if (normalizedName.endsWith(".xlsx") || supportedXlsxMimeTypes.has(normalizedType)) {
    return "xlsx";
  }

  throw new UnsupportedImportFileError();
}

function parseImportBuffer(buffer: Buffer, kind: ImportFileKind): RawImportRow[] {
  if (kind === "csv") {
    return parseCsv(new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, ""));
  }

  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(arrayBuffer).set(buffer);
  return parseXlsx(arrayBuffer);
}

function getHeaders(rows: RawImportRow[]) {
  const headers = new Set<string>();
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => headers.add(key));
  });
  return Array.from(headers);
}

function buildMissingMappingRows(rawRows: RawImportRow[], columnMap: ImportColumnMap): ImportPreviewRow[] {
  const missingColumns = getMissingRequiredColumns(columnMap).join(", ");
  const error = `Mapeamento incompleto: falta ${missingColumns}.`;

  return rawRows.map((raw, index) => ({
    amount: null,
    category: "OUTRO",
    description: "",
    duplicateKey: null,
    errors: [error],
    id: `row-${index + 2}`,
    occurred_on: null,
    raw,
    rowNumber: index + 2,
    signedAmount: null,
    status: "error",
    type: null,
  }));
}

function buildParseResult(fileName: string, columnMap: ImportColumnMap, rows: ImportPreviewRow[]): ImportParseResult {
  return {
    columnMap,
    fileName,
    rows,
    summary: summarizeImportRows(rows),
  };
}
