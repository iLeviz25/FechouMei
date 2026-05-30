import type {
  AgentActionId,
  AgentQuickPeriodQuery,
  AgentSpecificMovementQuery,
} from "@/lib/agent/types";
import { parseSpecificMovementQuery } from "@/lib/agent/movement-queries";
import { parseQuickPeriodQuery } from "@/lib/agent/period-queries";
import { normalizeText } from "@/lib/agent/transaction-parser";

export type AgentV2ReadToolName =
  | "get_monthly_report"
  | "get_obligations_status"
  | "get_period_report"
  | "get_recent_transactions";

export type AgentV2ReadToolRequest =
  | {
      action: Extract<AgentActionId, "quick_period_query">;
      input: {
        periodQuery: AgentQuickPeriodQuery;
      };
      name: "get_monthly_report" | "get_period_report";
    }
  | {
      action: Extract<AgentActionId, "specific_movement_query">;
      input: {
        specificMovementQuery: AgentSpecificMovementQuery;
      };
      name: "get_recent_transactions";
    }
  | {
      action: Extract<AgentActionId, "obligations_status">;
      input: Record<string, never>;
      name: "get_obligations_status";
    };

export const agentV2ReadToolSchemas: Record<AgentV2ReadToolName, {
  description: string;
  readsUserData: boolean;
  requiresConfirmation: boolean;
}> = {
  get_monthly_report: {
    description: "Consulta resumo mensal real do usuário, respeitando mês explícito e períodos relativos.",
    readsUserData: true,
    requiresConfirmation: false,
  },
  get_obligations_status: {
    description: "Consulta obrigações pendentes ou concluídas do usuário no mês atual.",
    readsUserData: true,
    requiresConfirmation: false,
  },
  get_period_report: {
    description: "Consulta entradas, despesas e resultado real de um período seguro.",
    readsUserData: true,
    requiresConfirmation: false,
  },
  get_recent_transactions: {
    description: "Consulta poucas movimentações recentes do usuário, com filtro opcional por tipo.",
    readsUserData: true,
    requiresConfirmation: false,
  },
};

export function detectAgentV2ReadToolRequest(message: string): AgentV2ReadToolRequest | null {
  const normalized = normalizeText(message);

  if (isExplanationLikeQuestion(normalized)) {
    return null;
  }

  const periodQuery = parseQuickPeriodQuery(normalized);

  if (periodQuery) {
    return {
      action: "quick_period_query",
      input: { periodQuery },
      name: getPeriodToolName(periodQuery),
    };
  }

  const specificMovementQuery = parseSpecificMovementQuery(message);

  if (specificMovementQuery && isSafeRecentMovementRequest(specificMovementQuery)) {
    return {
      action: "specific_movement_query",
      input: {
        specificMovementQuery: {
          ...specificMovementQuery,
          limit: Math.min(Math.max(specificMovementQuery.limit ?? 3, 1), 5),
        },
      },
      name: "get_recent_transactions",
    };
  }

  if (isObligationsStatusQuestion(normalized)) {
    return {
      action: "obligations_status",
      input: {},
      name: "get_obligations_status",
    };
  }

  return null;
}

export function isAgentV2SupportedReadIntent(message: string) {
  return Boolean(detectAgentV2ReadToolRequest(message));
}

function getPeriodToolName(query: AgentQuickPeriodQuery): "get_monthly_report" | "get_period_report" {
  if (
    query.type === "period" &&
    query.format === "report" &&
    (query.range === "explicit_month" || query.range === "last_month" || query.range === "this_month")
  ) {
    return "get_monthly_report";
  }

  return "get_period_report";
}

function isSafeRecentMovementRequest(query: AgentSpecificMovementQuery) {
  return query.order === "latest" && (query.limit ?? 1) <= 5;
}

function isObligationsStatusQuestion(normalized: string) {
  return (
    /\b(obrigacao|obrigacoes|pendencia|pendencias|pendente|pendentes|dasn?|checklist)\b/.test(normalized) &&
    /\b(tenho|tem|alguma|algum|quais|qual|status|ver|mostra|mostrar|pendente|pendentes|concluida|concluidas|concluido|concluidos)\b/.test(normalized)
  );
}

function isExplanationLikeQuestion(normalized: string) {
  return /\b(nao entendi|me explica|explica|explique|o que e|como funciona|pra que serve|para que serve)\b/.test(normalized);
}
