import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getImportableRows } from "@/lib/import/normalize-import-row";
import { getExistingImportDuplicateKeys, insertImportMovements } from "@/lib/import/persistence";
import { processImportFileForPreview, resolveImportFileKind } from "@/lib/import/process-file";
import { createClient } from "@/lib/supabase/server";
import type { Database, ImportSession, ImportSessionRow, Json } from "@/types/database";
import type { ImportableMovement, ImportColumnMap, ImportParseResult, ImportPreviewRow, ImportSummary, RawImportRow } from "./types";

export type ImportReviewSessionView = {
  columnMap: ImportColumnMap;
  parseResult: ImportParseResult;
  rows: ImportPreviewRow[];
  session: ImportSession;
  summary: ImportSummary;
};

export type ImportSessionActionResult = {
  importedCount?: number;
  importedIncomeAmount?: number;
  importedIncomeCount?: number;
  importedExpenseAmount?: number;
  importedExpenseCount?: number;
  ok: boolean;
  message: string;
  reviewUrl?: string;
  skippedDuplicateCount?: number;
};

type ImportSessionClient = SupabaseClient<Database>;

export async function createImportReviewSessionFromFile({
  buffer,
  channelRemoteId,
  fileName,
  fileType,
  source = "whatsapp",
  supabase,
  userId,
}: {
  buffer: Buffer;
  channelRemoteId?: string | null;
  fileName: string;
  fileType?: string | null;
  source?: "upload" | "whatsapp";
  supabase: ImportSessionClient;
  userId: string;
}) {
  const fileKind = resolveImportFileKind({ fileName, fileType });
  const parseResult = await processImportFileForPreview({
    buffer,
    fileName,
    fileType,
    supabase,
    userId,
  });

  return createImportReviewSession({
    fileName,
    fileType: fileKind,
    channelRemoteId,
    parseResult,
    source,
    supabase,
    userId,
  });
}

export async function createImportReviewSession({
  channelRemoteId,
  fileName,
  fileType,
  parseResult,
  source,
  supabase,
  userId,
}: {
  channelRemoteId?: string | null;
  fileName: string;
  fileType: string;
  parseResult: ImportParseResult;
  source: "upload" | "whatsapp";
  supabase: ImportSessionClient;
  userId: string;
}) {
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const summary = buildStoredSummary(parseResult);
  const { data: session, error: sessionError } = await supabase
    .from("import_sessions")
    .insert({
      channel_remote_id: channelRemoteId ?? null,
      expires_at: expiresAt,
      file_name: fileName,
      file_type: fileType,
      source,
      status: "draft",
      summary,
      user_id: userId,
    })
    .select("*")
    .single();

  if (sessionError || !session) {
    throw new Error(sessionError?.message ?? "Nao foi possivel criar a sessao de revisao.");
  }

  if (parseResult.rows.length > 0) {
    const { error: rowsError } = await supabase.from("import_session_rows").insert(
      parseResult.rows.map((row, index) => ({
        error_message: row.errors.join(" "),
        normalized_data: toJson(row),
        raw_data: toJson(row.raw),
        row_index: index,
        session_id: session.id,
        status: row.status,
      })),
    );

    if (rowsError) {
      await supabase.from("import_sessions").update({ status: "failed" }).eq("id", session.id);
      throw new Error(rowsError.message);
    }
  }

  return {
    parseResult,
    session,
  };
}

export async function getImportReviewSessionForCurrentUser(sessionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Faca login para revisar esta importacao.");
  }

  return getImportReviewSession({ sessionId, supabase, userId: user.id });
}

export async function confirmImportReviewSession(sessionId: string): Promise<ImportSessionActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("Faca login para importar movimentacoes.");
    }

    const view = await getImportReviewSession({ sessionId, supabase, userId: user.id });

    if (!view) {
      throw new Error("Sessao de importacao nao encontrada.");
    }

    return confirmLoadedImportReviewSession({
      requireCleanRows: false,
      supabase,
      userId: user.id,
      view,
    });
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Nao foi possivel importar as movimentacoes.",
    };
  }
}

export async function findLatestWhatsAppImportSession({
  channelRemoteId,
  supabase,
  userId,
}: {
  channelRemoteId?: string | null;
  supabase: ImportSessionClient;
  userId: string;
}) {
  let query = supabase
    .from("import_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("source", "whatsapp")
    .order("created_at", { ascending: false })
    .limit(1);

  if (channelRemoteId) {
    query = query.eq("channel_remote_id", channelRemoteId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  return buildImportReviewSessionView({ session: data, supabase });
}

export async function confirmWhatsAppImportSession({
  channelRemoteId,
  supabase,
  userId,
}: {
  channelRemoteId?: string | null;
  supabase: ImportSessionClient;
  userId: string;
}) {
  const view = await findLatestWhatsAppImportSession({ channelRemoteId, supabase, userId });

  if (!view) {
    return {
      ok: false,
      message: "Nao encontrei nenhuma importacao pendente para confirmar. Envie uma planilha CSV ou XLSX para eu preparar.",
    };
  }

  return confirmLoadedImportReviewSession({
    requireCleanRows: true,
    supabase,
    userId,
    view,
  });
}

export async function cancelWhatsAppImportSession({
  channelRemoteId,
  supabase,
  userId,
}: {
  channelRemoteId?: string | null;
  supabase: ImportSessionClient;
  userId: string;
}) {
  const view = await findLatestWhatsAppImportSession({ channelRemoteId, supabase, userId });

  if (!view) {
    return {
      ok: false,
      message: "Nao encontrei nenhuma importacao pendente para cancelar.",
    };
  }

  if (view.session.status === "imported") {
    return {
      importedCount: 0,
      ok: true,
      message: "Essa planilha ja foi importada. Nao importei novamente para evitar duplicidade.",
    };
  }

  if (view.session.status === "cancelled") {
    return {
      ok: true,
      message: "Essa importacao ja estava cancelada. Nenhuma movimentacao foi salva.",
    };
  }

  const { error } = await supabase
    .from("import_sessions")
    .update({ status: "cancelled" })
    .eq("id", view.session.id)
    .eq("user_id", userId)
    .in("status", ["draft", "reviewed"]);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/app/importar");
  revalidatePath(`/app/importar/sessao/${view.session.id}`);

  return {
    ok: true,
    message: "Importacao cancelada. Nenhuma movimentacao foi salva.",
  };
}

export async function cancelImportReviewSession(sessionId: string): Promise<ImportSessionActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("Faca login para cancelar esta importacao.");
    }

    const { error } = await supabase
      .from("import_sessions")
      .update({ status: "cancelled" })
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .in("status", ["draft", "reviewed"]);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/app/importar");
    revalidatePath(`/app/importar/sessao/${sessionId}`);

    return {
      ok: true,
      message: "Importacao cancelada. Nenhuma movimentacao foi salva.",
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Nao foi possivel cancelar a importacao.",
    };
  }
}

async function getImportReviewSession({
  sessionId,
  supabase,
  userId,
}: {
  sessionId: string;
  supabase: ImportSessionClient;
  userId: string;
}): Promise<ImportReviewSessionView | null> {
  const { data: session, error: sessionError } = await supabase
    .from("import_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  if (!session) {
    return null;
  }

  return buildImportReviewSessionView({ session, supabase });
}

async function buildImportReviewSessionView({
  session,
  supabase,
}: {
  session: ImportSession;
  supabase: ImportSessionClient;
}): Promise<ImportReviewSessionView> {
  const { data: rows, error: rowsError } = await supabase
    .from("import_session_rows")
    .select("*")
    .eq("session_id", session.id)
    .order("row_index", { ascending: true });

  if (rowsError) {
    throw new Error(rowsError.message);
  }

  const importRows = (rows ?? []).map(rowFromRecord);
  const summaryRecord = coerceSummaryRecord(session.summary);
  const columnMap = coerceColumnMap(summaryRecord.columnMap);
  const parseResult = {
    columnMap,
    fileName: session.file_name ?? "arquivo enviado",
    rows: importRows,
    summary: summarizeRowsFromSession(summaryRecord, importRows),
  };

  return {
    columnMap,
    parseResult,
    rows: importRows,
    session,
    summary: parseResult.summary,
  };
}

async function confirmLoadedImportReviewSession({
  requireCleanRows,
  supabase,
  userId,
  view,
}: {
  requireCleanRows: boolean;
  supabase: ImportSessionClient;
  userId: string;
  view: ImportReviewSessionView;
}): Promise<ImportSessionActionResult> {
  if (view.session.status === "imported") {
    return {
      importedCount: 0,
      ok: true,
      message: "Essa planilha ja foi importada. Voce pode conferir em Movimentacoes.",
    };
  }

  if (view.session.status === "cancelled") {
    return {
      ok: false,
      message: "Essa importacao foi cancelada. Envie a planilha novamente para eu preparar uma nova revisao.",
    };
  }

  if (view.session.status !== "draft" && view.session.status !== "reviewed") {
    throw new Error("Esta sessao nao pode mais ser importada.");
  }

  if (isExpired(view.session)) {
    await supabase.from("import_sessions").update({ status: "expired" }).eq("id", view.session.id).eq("user_id", userId);
    throw new Error("Essa importacao expirou. Envie a planilha novamente para eu preparar uma nova revisao.");
  }

  const duplicateCount = view.summary.duplicateExistingCount + view.summary.duplicateFileCount;

  if (requireCleanRows && view.summary.errorCount > 0) {
    return {
      ok: false,
      message: "Essa importacao tem linhas que precisam de atencao. Para evitar salvar algo errado, revise pelo link.",
      reviewUrl: `/app/importar/sessao/${view.session.id}`,
    };
  }

  const importableRows = getImportableRows(view.rows);

  if (importableRows.length === 0) {
    if (duplicateCount > 0) {
      return {
        importedCount: 0,
        ok: true,
        skippedDuplicateCount: duplicateCount,
        message: `Esse arquivo parece ja ter sido importado antes. Encontrei ${duplicateCount} movimentacao${duplicateCount === 1 ? "" : "es"}, mas todas parecem ja existir no FechouMEI. Nao importei novamente para evitar duplicidade.`,
      };
    }

    throw new Error("Nao ha linhas validas para importar.");
  }

  const existingDuplicateKeys = await getExistingImportDuplicateKeys({
    rows: importableRows,
    supabase,
    userId,
  });
  const rowsToInsert = importableRows.filter((row) => !existingDuplicateKeys.has(row.duplicateKey));

  if (rowsToInsert.length > 0) {
    await insertImportMovements({ rows: rowsToInsert, supabase, userId });
  } else if (existingDuplicateKeys.size > 0) {
    return {
      importedCount: 0,
      ok: true,
      skippedDuplicateCount: importableRows.length,
      message: `Esse arquivo parece ja ter sido importado antes. Encontrei ${importableRows.length} movimentacao${importableRows.length === 1 ? "" : "es"}, mas todas parecem ja existir no FechouMEI. Nao importei novamente para evitar duplicidade.`,
    };
  }

  const skippedDuplicateCount = importableRows.length - rowsToInsert.length;
  const importedTotals = summarizeImportableRows(rowsToInsert);
  const updatedSummary = toJson({
    ...coerceSummaryRecord(view.session.summary),
    importedAt: new Date().toISOString(),
    importedCount: rowsToInsert.length,
    importedExpenseAmount: importedTotals.expenseAmount,
    importedExpenseCount: importedTotals.expenseCount,
    importedIncomeAmount: importedTotals.incomeAmount,
    importedIncomeCount: importedTotals.incomeCount,
    skippedDuplicateCount,
  });

  const { error: updateError } = await supabase
    .from("import_sessions")
    .update({
      status: "imported",
      summary: updatedSummary,
    })
    .eq("id", view.session.id)
    .eq("user_id", userId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidatePath("/app/dashboard");
  revalidatePath("/app/fechamento-mensal");
  revalidatePath("/app/importar");
  revalidatePath(`/app/importar/sessao/${view.session.id}`);
  revalidatePath("/app/movimentacoes");

  return {
    importedCount: rowsToInsert.length,
    importedExpenseAmount: importedTotals.expenseAmount,
    importedExpenseCount: importedTotals.expenseCount,
    importedIncomeAmount: importedTotals.incomeAmount,
    importedIncomeCount: importedTotals.incomeCount,
    ok: true,
    skippedDuplicateCount,
    message:
      rowsToInsert.length === 1
        ? "1 movimentacao importada com sucesso."
        : `${rowsToInsert.length} movimentacoes importadas com sucesso.`,
  };
}

function rowFromRecord(row: ImportSessionRow): ImportPreviewRow {
  const normalized = coerceRecord(row.normalized_data) as Partial<ImportPreviewRow>;
  const raw = coerceRecord(row.raw_data) as RawImportRow;
  const status = row.status === "duplicate" ? "duplicate_existing" : row.status;

  return {
    amount: typeof normalized.amount === "number" ? normalized.amount : null,
    category: typeof normalized.category === "string" ? normalized.category : "OUTRO",
    description: typeof normalized.description === "string" ? normalized.description : "",
    duplicateKey: typeof normalized.duplicateKey === "string" ? normalized.duplicateKey : null,
    errors: Array.isArray(normalized.errors)
      ? normalized.errors.filter((error): error is string => typeof error === "string")
      : row.error_message
        ? [row.error_message]
        : [],
    id: typeof normalized.id === "string" ? normalized.id : row.id,
    occurred_on: typeof normalized.occurred_on === "string" ? normalized.occurred_on : null,
    raw,
    rowNumber: typeof normalized.rowNumber === "number" ? normalized.rowNumber : row.row_index + 1,
    signedAmount: typeof normalized.signedAmount === "number" ? normalized.signedAmount : null,
    status,
    type: normalized.type === "entrada" || normalized.type === "despesa" ? normalized.type : null,
  };
}

function buildStoredSummary(parseResult: ImportParseResult) {
  return toJson({
    ...parseResult.summary,
    columnMap: parseResult.columnMap,
  });
}

function summarizeRowsFromSession(summaryRecord: Record<string, unknown>, rows: ImportPreviewRow[]): ImportSummary {
  return {
    duplicateExistingCount: readNumber(summaryRecord.duplicateExistingCount),
    duplicateFileCount: readNumber(summaryRecord.duplicateFileCount),
    errorCount: readNumber(summaryRecord.errorCount),
    expenseAmount: readNumber(summaryRecord.expenseAmount),
    expenseCount: readNumber(summaryRecord.expenseCount),
    importableCount: readNumber(summaryRecord.importableCount),
    incomeAmount: readNumber(summaryRecord.incomeAmount),
    incomeCount: readNumber(summaryRecord.incomeCount),
    totalRows: readNumber(summaryRecord.totalRows) || rows.length,
  };
}

function summarizeImportableRows(rows: ImportableMovement[]) {
  return rows.reduce(
    (summary, row) => {
      if (row.type === "entrada") {
        summary.incomeCount += 1;
        summary.incomeAmount += row.amount;
      } else {
        summary.expenseCount += 1;
        summary.expenseAmount += row.amount;
      }

      return summary;
    },
    {
      expenseAmount: 0,
      expenseCount: 0,
      incomeAmount: 0,
      incomeCount: 0,
    },
  );
}

function isExpired(session: ImportSession) {
  return new Date(session.expires_at).getTime() < Date.now();
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function coerceColumnMap(value: unknown): ImportColumnMap {
  const record = coerceRecord(value);
  return Object.fromEntries(
    Object.entries(record).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  ) as ImportColumnMap;
}

function coerceSummaryRecord(value: Json) {
  return coerceRecord(value);
}

function coerceRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}
