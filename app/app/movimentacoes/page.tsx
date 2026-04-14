import { MovimentacoesManager } from "@/components/movimentacoes/movimentacoes-manager";
import { createClient } from "@/lib/supabase/server";

export default async function MovimentacoesPage() {
  const supabase = await createClient();

  const { data: movements, error } = await supabase
    .from("movimentacoes")
    .select("id, type, description, amount, occurred_on, category")
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Erro ao carregar movimentações: ${error.message}`);
  }

  return <MovimentacoesManager movements={movements ?? []} />;
}
