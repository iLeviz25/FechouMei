import type { AgentActionDefinition, AgentActionId } from "@/lib/agent/types";

export const agentActionCatalog: AgentActionDefinition[] = [
  { id: "register_income", label: "Registrar entrada", status: "implemented", changesData: true, description: "Cria uma movimentação de entrada." },
  { id: "register_expense", label: "Registrar despesa", status: "implemented", changesData: true, description: "Cria uma movimentação de despesa." },
  { id: "register_movements_batch", label: "Registrar movimentações", status: "implemented", changesData: true, description: "Cria um lote curto de entradas e despesas após confirmação." },
  { id: "monthly_summary", label: "Resumo mensal", status: "implemented", changesData: false, description: "Consulta entradas, despesas e saldo do mês atual." },
  { id: "dashboard_overview", label: "Visão geral", status: "implemented", changesData: false, description: "Consulta entradas, despesas, saldo mensal e faturamento anual." },
  { id: "yearly_revenue", label: "Faturamento anual", status: "planned", changesData: false, description: "Consulta faturamento do ano de forma isolada." },
  { id: "mei_limit", label: "Limite do MEI", status: "implemented", changesData: false, description: "Consulta uso do limite anual do MEI." },
  { id: "obligations_status", label: "Obrigações", status: "implemented", changesData: false, description: "Consulta pendências principais do mês." },
  { id: "recent_transactions", label: "Movimentações recentes", status: "implemented", changesData: false, description: "Lista as últimas movimentações do usuário." },
  { id: "latest_transaction", label: "Última movimentação", status: "implemented", changesData: false, description: "Consulta a última movimentação, entrada ou despesa." },
  { id: "specific_movement_query", label: "Consulta específica de movimentação", status: "implemented", changesData: false, description: "Consulta movimentações por tipo, categoria, descrição, período, ordem ou valor." },
  { id: "mark_obligation", label: "Marcar obrigação", status: "implemented", changesData: true, description: "Marca uma obrigação do checklist como concluída." },
  { id: "reminder_preferences_status", label: "Consultar lembretes", status: "implemented", changesData: false, description: "Consulta as preferências simples de lembrete." },
  { id: "update_reminder_preferences", label: "Atualizar lembretes", status: "implemented", changesData: true, description: "Ativa ou desativa preferências simples de lembrete." },
  { id: "set_initial_balance", label: "Ajustar saldo", status: "implemented", changesData: true, description: "Atualiza o ponto de partida do saldo sem criar movimentação." },
  { id: "edit_transaction", label: "Editar movimentação", status: "implemented", changesData: true, description: "Edita rapidamente a última movimentação, entrada ou despesa." },
  { id: "delete_transaction", label: "Excluir movimentação", status: "implemented", changesData: true, description: "Exclui a última movimentação após confirmação." },
  { id: "export_transactions", label: "Exportar dados", status: "planned", changesData: false, description: "Exporta movimentações em CSV pelo agente." },
  { id: "profile_overview", label: "Perfil", status: "planned", changesData: false, description: "Consulta dados básicos do perfil." },
];

export const implementedAgentActions = new Set(
  agentActionCatalog.filter((action) => action.status === "implemented").map((action) => action.id),
);

export function getActionDefinition(actionId: AgentActionId) {
  return agentActionCatalog.find((action) => action.id === actionId);
}
