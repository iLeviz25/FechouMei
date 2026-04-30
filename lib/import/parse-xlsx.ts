import * as XLSX from "xlsx";
import type { RawImportRow } from "@/lib/import/types";

export function parseXlsx(buffer: ArrayBuffer): RawImportRow[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return [];
  }

  const worksheet = workbook.Sheets[firstSheetName];

  return XLSX.utils.sheet_to_json<RawImportRow>(worksheet, {
    blankrows: false,
    defval: "",
    raw: false,
  });
}
