"use server";

import { cancelImportReviewSession, confirmImportReviewSession, type ImportSessionActionResult } from "@/lib/import/sessions";

export type ImportSessionFormState = ImportSessionActionResult | null;

export async function confirmImportSessionAction(
  _previousState: ImportSessionFormState,
  formData: FormData,
): Promise<ImportSessionFormState> {
  const sessionId = String(formData.get("sessionId") ?? "");

  if (!sessionId) {
    return {
      ok: false,
      message: "Não foi possível encontrar esta revisão.",
    };
  }

  return confirmImportReviewSession(sessionId);
}

export async function cancelImportSessionAction(
  _previousState: ImportSessionFormState,
  formData: FormData,
): Promise<ImportSessionFormState> {
  const sessionId = String(formData.get("sessionId") ?? "");

  if (!sessionId) {
    return {
      ok: false,
      message: "Não foi possível encontrar esta revisão.",
    };
  }

  return cancelImportReviewSession(sessionId);
}
