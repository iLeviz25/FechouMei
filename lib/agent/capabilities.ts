import type { AgentConversationState } from "@/lib/agent/types";

export function getAgentCapabilitiesReply(state?: AgentConversationState) {
  const pendingHint =
    state && state.status !== "idle"
      ? " Seu rascunho continua salvo; quando quiser, a gente retoma."
      : "";

  return "Claro. Voce pode me pedir 3 coisas principais: registrar entrada/despesa, consultar seu mes ou gerar relatorio diario, semanal e mensal. Me manda do seu jeito que eu organizo." + pendingHint;
}
