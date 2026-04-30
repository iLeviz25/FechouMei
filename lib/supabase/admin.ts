import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const SUPABASE_URL_PLACEHOLDER = "https://your-project-ref.supabase.co";
const SERVICE_ROLE_PLACEHOLDER = "your-supabase-service-role-key";

function getMissingEnvMessage(issues: string[]) {
  if (process.env.NODE_ENV === "production") {
    return "A exclusão segura da conta ainda não está configurada no servidor.";
  }

  return `Admin client do Supabase não pôde ser inicializado: ${issues.join(
    "; ",
  )}. Confira o .env.local e reinicie o servidor de desenvolvimento.`;
}

export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("O admin client do Supabase só pode ser inicializado no servidor.");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const issues: string[] = [];

  if (!supabaseUrl) {
    issues.push("faltando NEXT_PUBLIC_SUPABASE_URL");
  } else if (supabaseUrl === SUPABASE_URL_PLACEHOLDER) {
    issues.push("NEXT_PUBLIC_SUPABASE_URL ainda está com valor de exemplo");
  }

  if (!serviceRoleKey) {
    issues.push("faltando SUPABASE_SERVICE_ROLE_KEY");
  } else if (serviceRoleKey === SERVICE_ROLE_PLACEHOLDER) {
    issues.push("SUPABASE_SERVICE_ROLE_KEY ainda está com valor de exemplo");
  }

  if (!serviceRoleKey && process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY) {
    issues.push("use SUPABASE_SERVICE_ROLE_KEY sem NEXT_PUBLIC_ para não expor a chave no client");
  }

  if (issues.length > 0 || !supabaseUrl || !serviceRoleKey) {
    throw new Error(getMissingEnvMessage(issues.length > 0 ? issues : ["variáveis do admin client inválidas"]));
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export const createServiceRoleClient = createAdminClient;
