"use server";

import { revalidatePath } from "next/cache";
import { getExistingImportDuplicateKeys, insertImportMovements, isImportableMovement } from "@/lib/import/persistence";
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
    const duplicateKeys = await getExistingImportDuplicateKeys({ rows, supabase, userId });

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
    const existingDuplicateKeys = await getExistingImportDuplicateKeys({ rows: validRows, supabase, userId });
    const rowsToInsert = validRows.filter((row) => !existingDuplicateKeys.has(row.duplicateKey));

    if (rowsToInsert.length === 0) {
      return {
        importedCount: 0,
        ok: true,
        skippedDuplicateCount: validRows.length,
        message: "Nenhuma movimentacao nova importada. Todas pareciam duplicadas.",
      };
    }

    await insertImportMovements({ rows: rowsToInsert, supabase, userId });

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
