import type { SupabaseClient } from "@supabase/supabase-js";
import { buildImportDuplicateKey } from "@/lib/import/dedupe";
import { buildOccurredAtFromDateInput, normalizeMovementCategory, normalizeMovementDescription } from "@/lib/movements/normalization";
import type { Database } from "@/types/database";
import type { ImportableMovement } from "./types";

export type ImportPersistenceClient = SupabaseClient<Database>;

export function isImportableMovement(row: ImportableMovement) {
  return (
    (row.type === "entrada" || row.type === "despesa") &&
    /^\d{4}-\d{2}-\d{2}$/.test(row.occurred_on) &&
    row.description.trim().length > 0 &&
    Number.isFinite(row.amount) &&
    row.amount > 0 &&
    row.category.trim().length > 0 &&
    row.duplicateKey.trim().length > 0
  );
}

export async function getExistingImportDuplicateKeys({
  rows,
  supabase,
  userId,
}: {
  rows: ImportableMovement[];
  supabase: ImportPersistenceClient;
  userId: string;
}) {
  const dates = rows.map((row) => row.occurred_on).filter(Boolean).sort();

  if (dates.length === 0) {
    return new Set<string>();
  }

  const { data, error } = await supabase
    .from("movimentacoes")
    .select("amount, description, occurred_on, type")
    .eq("user_id", userId)
    .gte("occurred_on", dates[0])
    .lte("occurred_on", dates[dates.length - 1]);

  if (error) {
    throw new Error(error.message);
  }

  return new Set(
    (data ?? []).map((movement) =>
      buildImportDuplicateKey({
        amount: Number(movement.amount),
        description: movement.description,
        occurred_on: movement.occurred_on,
        type: movement.type,
      }),
    ),
  );
}

export async function insertImportMovements({
  rows,
  supabase,
  userId,
}: {
  rows: ImportableMovement[];
  supabase: ImportPersistenceClient;
  userId: string;
}) {
  const validRows = rows.filter(isImportableMovement);

  if (validRows.length === 0) {
    throw new Error("Nenhuma movimentacao valida para importar.");
  }

  const now = new Date();
  const { error } = await supabase.from("movimentacoes").insert(
    validRows.map((row) => ({
      amount: row.amount,
      category: normalizeMovementCategory(row.category),
      description: normalizeMovementDescription(row.description),
      occurred_at: buildOccurredAtFromDateInput(row.occurred_on, now),
      occurred_on: row.occurred_on,
      type: row.type,
      user_id: userId,
    })),
  );

  if (error) {
    throw new Error(error.message);
  }

  return validRows.length;
}
