"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AccountActionResult = {
  ok: boolean;
  message: string;
};

const DELETE_CONFIRMATION = "EXCLUIR";

export async function deleteAccount({
  confirmation,
}: {
  confirmation: string;
}): Promise<AccountActionResult> {
  try {
    if (confirmation.trim().toUpperCase() !== DELETE_CONFIRMATION) {
      return {
        ok: false,
        message: "Digite EXCLUIR para confirmar a exclusão definitiva da conta.",
      };
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        ok: false,
        message: "Faça login novamente antes de excluir a conta.",
      };
    }

    const admin = createAdminClient();
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id, false);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    await supabase.auth.signOut();

    return {
      ok: true,
      message: "Conta excluída com sucesso.",
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Não foi possível excluir a conta agora.",
    };
  }
}
