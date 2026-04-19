import type { AgentActionDefinition, AgentActionId } from "@/lib/agent/types";

export const agentActionCatalog: AgentActionDefinition[] = [
  { id: "register_income", label: "Registrar entrada", status: "implemented", changesData: true, description: "Cria uma movimentacao de entrada." },
  { id: "register_expense", label: "Registrar despesa", status: "implemented", changesData: true, description: "Cria uma movimentacao de despesa." },
  { id: "register_movements_batch", label: "Registrar movimentacoes", status: "implemented", changesData: true, description: "Cria um lote curto de entradas e despesas apos confirmacao." },
  { id: "monthly_summary", label: "Resumo mensal", status: "implemented", changesData: false, description: "Consulta entradas, despesas e saldo do mes atual." },
  { id: "dashboard_overview", label: "Visao geral", status: "implemented", changesData: false, description: "Consulta entradas, despesas, saldo mensal e faturamento anual." },
  { id: "yearly_revenue", label: "Faturamento anual", status: "planned", changesData: false, description: "Consulta faturamento do ano de forma isolada." },
  { id: "mei_limit", label: "Limite do MEI", status: "implemented", changesData: false, description: "Consulta uso do limite anual do MEI." },
  { id: "obligations_status", label: "Obrigacoes", status: "implemented", changesData: false, description: "Consulta pendencias principais do mes." },
  { id: "recent_transactions", label: "Movimentacoes recentes", status: "implemented", changesData: false, description: "Lista as ultimas movimentacoes do usuario." },
  { id: "latest_transaction", label: "Ultima movimentacao", status: "implemented", changesData: false, description: "Consulta a ultima movimentacao, entrada ou despesa." },
  { id: "mark_obligation", label: "Marcar obrigacao", status: "implemented", changesData: true, description: "Marca uma obrigacao do checklist como concluida." },
  { id: "reminder_preferences_status", label: "Consultar lembretes", status: "implemented", changesData: false, description: "Consulta as preferencias simples de lembrete." },
  { id: "update_reminder_preferences", label: "Atualizar lembretes", status: "implemented", changesData: true, description: "Ativa ou desativa preferencias simples de lembrete." },
  { id: "edit_transaction", label: "Editar movimentacao", status: "implemented", changesData: true, description: "Edita rapidamente a ultima movimentacao, entrada ou despesa." },
  { id: "delete_transaction", label: "Excluir movimentacao", status: "implemented", changesData: true, description: "Exclui a ultima movimentacao apos confirmacao." },
  { id: "export_transactions", label: "Exportar dados", status: "planned", changesData: false, description: "Exporta movimentacoes em CSV pelo agente." },
  { id: "profile_overview", label: "Perfil", status: "planned", changesData: false, description: "Consulta dados basicos do perfil." },
];

export const implementedAgentActions = new Set(
  agentActionCatalog.filter((action) => action.status === "implemented").map((action) => action.id),
);

export function getActionDefinition(actionId: AgentActionId) {
  return agentActionCatalog.find((action) => action.id === actionId);
}
