import type { AgentConversationState } from "@/lib/agent/types";

export function getAgentCapabilitiesReply(state?: AgentConversationState) {
  const pendingHint =
    state && state.status !== "idle"
      ? "\n\nSeu rascunho continua salvo; quando quiser, a gente retoma."
      : "";

  return [
    "Eu posso te ajudar a cuidar do seu MEI direto por aqui 😊",
    "",
    "Consigo te ajudar com:",
    "• registrar entradas e despesas;",
    "• consultar movimentações;",
    "• gerar relatórios do mês;",
    "• ver como está seu resultado;",
    "• acompanhar obrigações;",
    "• tirar dúvidas simples sobre como usar o FechouMEI.",
    "",
    "Me diga o que você quer fazer agora.",
  ].join("\n") + pendingHint;
}
