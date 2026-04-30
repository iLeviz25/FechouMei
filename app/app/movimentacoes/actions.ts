"use server";

import { revalidatePath } from "next/cache";
import {
  buildOccurredAtFromDateInput,
  normalizeMovementCategory,
  normalizeMovementDescription,
} from "@/lib/movements/normalization";
import { createClient } from "@/lib/supabase/server";

export type MovementActionResult = {
  deletedCount?: number;
  ok: boolean;
  message: string;
};

type MovementInput = {
  type: "entrada" | "despesa";
  description: string;
  amount: number;
  occurred_on: string;
  occurred_at: string;
  category: string;
};

function readMovementInput(formData: FormData): MovementInput {
  const type = String(formData.get("type") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const rawAmount = String(formData.get("amount") ?? "").trim();
  const occurred_on = String(formData.get("occurred_on") ?? "");
  const category = String(formData.get("category") ?? "").trim();

  if (type !== "entrada" && type !== "despesa") {
    throw new Error("Escolha entrada ou despesa.");
  }

  if (!description) {
    throw new Error("Informe uma descrição.");
  }

  if (!/^\d+([,.]\d{1,2})?$/.test(rawAmount)) {
    throw new Error("Informe um valor em reais, como 120,50.");
  }

  const amount = Number(rawAmount.replace(",", "."));

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Informe um valor maior que zero.");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurred_on)) {
    throw new Error("Informe uma data válida.");
  }

  if (!category) {
    throw new Error("Informe uma categoria.");
  }

  return {
    type,
    description: normalizeMovementDescription(description),
    amount,
    occurred_on,
    occurred_at: buildOccurredAtFromDateInput(occurred_on),
    category: normalizeMovementCategory(category),
  };
}

async function getUserId() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Faça login para continuar.");
  }

  return { supabase, userId: user.id };
}

export async function createMovimentacao(formData: FormData): Promise<MovementActionResult> {
  try {
    const input = readMovementInput(formData);
    const { supabase, userId } = await getUserId();

    const { error } = await supabase.from("movimentacoes").insert({
      ...input,
      user_id: userId,
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/app/movimentacoes");
    revalidatePath("/app/dashboard");
    revalidatePath("/app/fechamento-mensal");
    return { ok: true, message: "Movimentação criada." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Não foi possível criar a movimentação.",
    };
  }
}

export async function updateMovimentacao(
  id: string,
  formData: FormData,
): Promise<MovementActionResult> {
  try {
    const input = readMovementInput(formData);
    const { supabase, userId } = await getUserId();

    const { error } = await supabase
      .from("movimentacoes")
      .update(input)
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/app/movimentacoes");
    revalidatePath("/app/dashboard");
    revalidatePath("/app/fechamento-mensal");
    return { ok: true, message: "Movimentação atualizada." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Não foi possível editar a movimentação.",
    };
  }
}

export async function deleteMovimentacao(id: string): Promise<MovementActionResult> {
  try {
    const { supabase, userId } = await getUserId();

    const { error } = await supabase.from("movimentacoes").delete().eq("id", id).eq("user_id", userId);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/app/movimentacoes");
    revalidatePath("/app/dashboard");
    revalidatePath("/app/fechamento-mensal");
    return { ok: true, message: "Movimentação excluída." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Não foi possível excluir a movimentação.",
    };
  }
}

export async function deleteMovimentacoes(ids: string[]): Promise<MovementActionResult> {
  try {
    const uniqueIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));

    if (uniqueIds.length === 0) {
      throw new Error("Selecione pelo menos uma movimentação.");
    }

    const { supabase, userId } = await getUserId();

    const { data, error } = await supabase
      .from("movimentacoes")
      .delete()
      .eq("user_id", userId)
      .in("id", uniqueIds)
      .select("id");

    if (error) {
      throw new Error(error.message);
    }

    const deletedCount = data?.length ?? 0;

    if (deletedCount === 0) {
      throw new Error("Não encontrei movimentações para excluir.");
    }

    revalidatePath("/app/movimentacoes");
    revalidatePath("/app/dashboard");
    revalidatePath("/app/fechamento-mensal");

    return {
      deletedCount,
      ok: true,
      message: deletedCount === 1 ? "Movimentação excluída." : `${deletedCount} movimentações excluídas.`,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Não foi possível excluir as movimentações.",
    };
  }
}
