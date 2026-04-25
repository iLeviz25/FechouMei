"use server";

import { revalidatePath } from "next/cache";
import {
  buildOccurredAtFromDateInput,
  normalizeMovementCategory,
  normalizeMovementDescription,
} from "@/lib/movements/normalization";
import { buildImportDuplicateKey } from "@/lib/import/dedupe";
import { createClient } from "@/lib/supabase/server";
import type { ImportableMovement } from "@/lib/import/types";

export type ImportActionResult = {
  duplicateKeys?: string[];
  importedCount?: number;
  ok: boolean;
  message: string;
  skippedDuplicateCount?: number;
};

async function getAuthenticatedContext() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Faca login para importar movimentacoes.");
  }

  return { supabase, userId: user.id };
}

export async function checkImportDuplicates(rows: ImportableMovement[]): Promise<ImportActionResult> {
  try {
    const { supabase, userId } = await getAuthenticatedContext();
    const duplicateKeys = await getExistingDuplicateKeys({ rows, supabase, userId });

    return {
      duplicateKeys: Array.from(duplicateKeys),
      ok: true,
      message: duplicateKeys.size > 0 ? "Encontramos possiveis duplicados no app." : "Nenhum duplicado encontrado no app.",
    };
  } catch (error) {
    return {
      duplicateKeys: [],
      ok: false,
      message: error instanceof Error ? error.message : "Nao foi possivel verificar duplicados.",
    };
  }
}

export async function importMovimentacoes(rows: ImportableMovement[]): Promise<ImportActionResult> {
  try {
    const validRows = rows.filter(isImportableMovement);

    if (validRows.length === 0) {
      throw new Error("Nenhuma movimentacao valida para importar.");
    }

    const { supabase, userId } = await getAuthenticatedContext();
    const existingDuplicateKeys = await getExistingDuplicateKeys({ rows: validRows, supabase, userId });
    const rowsToInsert = validRows.filter((row) => !existingDuplicateKeys.has(row.duplicateKey));

    if (rowsToInsert.length === 0) {
      return {
        importedCount: 0,
        ok: true,
        skippedDuplicateCount: validRows.length,
        message: "Nenhuma movimentacao nova importada. Todas pareciam duplicadas.",
      };
    }

    const now = new Date();
    const { error } = await supabase.from("movimentacoes").insert(
      rowsToInsert.map((row) => ({
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

    revalidatePath("/app/dashboard");
    revalidatePath("/app/fechamento-mensal");
    revalidatePath("/app/importar");
    revalidatePath("/app/movimentacoes");

    return {
      importedCount: rowsToInsert.length,
      ok: true,
      skippedDuplicateCount: validRows.length - rowsToInsert.length,
      message:
        rowsToInsert.length === 1
          ? "1 movimentacao importada com sucesso."
          : `${rowsToInsert.length} movimentacoes importadas com sucesso.`,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Nao foi possivel importar as movimentacoes.",
    };
  }
}

function isImportableMovement(row: ImportableMovement) {
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

async function getExistingDuplicateKeys({
  rows,
  supabase,
  userId,
}: {
  rows: ImportableMovement[];
  supabase: Awaited<ReturnType<typeof createClient>>;
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
