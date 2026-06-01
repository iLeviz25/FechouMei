import type { RawImportRow } from "@/lib/import/types";

export function parseCsv(text: string): RawImportRow[] {
  const rows = parseCsvCells(text);

  if (rows.length === 0) {
    return [];
  }

  const headerless = looksLikeHeaderlessMovement(rows[0]);
  const headers = headerless
    ? ["data", "descricao", "valor", "categoria", "tipo"]
    : rows[0].map((header, index) => header.trim() || `Coluna ${index + 1}`);
  const dataRows = headerless ? rows : rows.slice(1);

  return dataRows
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row) =>
      headers.reduce<RawImportRow>((acc, header, index) => {
        acc[header] = row[index]?.trim() ?? "";
        return acc;
      }, {}),
    );
}

function parseCsvCells(text: string) {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let currentCell = "";
  let currentRow: string[] = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === "\"") {
      if (quoted && nextChar === "\"") {
        currentCell += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === delimiter && !quoted) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }

      currentRow.push(currentCell);
      rows.push(currentRow);
      currentCell = "";
      currentRow = [];
      continue;
    }

    currentCell += char;
  }

  if (currentCell !== "" || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows.filter((row) => row.some((cell) => cell.trim() !== ""));
}

function detectDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const semicolonCount = (firstLine.match(/;/g) ?? []).length;

  return semicolonCount > commaCount ? ";" : ",";
}

function looksLikeHeaderlessMovement(row: string[] | undefined) {
  if (!row || row.length < 3) {
    return false;
  }

  const firstCell = row[0]?.trim() ?? "";
  const thirdCell = row[2]?.trim() ?? "";
  const looksLikeDate =
    /^\d{4}-\d{2}-\d{2}$/.test(firstCell) ||
    /^\d{2}\/\d{2}\/\d{4}$/.test(firstCell) ||
    /^\d{2}-\d{2}-\d{4}$/.test(firstCell);

  return looksLikeDate && /[0-9]/.test(thirdCell);
}
