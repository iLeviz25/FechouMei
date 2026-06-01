import type { ImportableMovement } from "@/lib/import/types";

export function normalizeDuplicateText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

export function buildImportDuplicateKey({
  amount,
  description,
  occurred_on,
  type,
}: Pick<ImportableMovement, "amount" | "description" | "occurred_on" | "type">) {
  return [
    occurred_on,
    normalizeDuplicateText(description),
    type,
    Math.round(amount * 100),
  ].join("|");
}
