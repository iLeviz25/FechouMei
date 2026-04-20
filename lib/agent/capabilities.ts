import type { AgentConversationState } from "@/lib/agent/types";

const capabilityExamples = [
  '"recebi 350 do Joao"',
  '"paguei 90 de internet"',
  '"recebi 500 da Ana e paguei 120 de gasolina"',
  '"como esta meu mes?"',
  '"quanto entrou essa semana?"',
  '"como foi minha semana?"',
  '"qual meu limite do MEI?"',
  '"ajustar saldo para 2 mil"',
  '"quais pendencias eu tenho agora?"',
];

export function getAgentCapabilitiesReply(state?: AgentConversationState) {
  const pendingHint =
    state && state.status !== "idle"
      ? "\n\nSeu rascunho continua salvo; quando quiser, a gente retoma."
      : "";

  return [
    "Sou a Helena, a assistente financeira do FechouMEI. Posso te ajudar com as coisas rapidas do dia a dia:",
    "- registrar entradas e despesas, sempre pedindo confirmacao antes de salvar;",
    "- corrigir um rascunho antes de confirmar;",
    "- mostrar resumo do mes, limite do MEI, pendencias e ultimos registros;",
    "- ajustar seu saldo atual sem criar uma receita falsa.",
    "",
    `Exemplos: ${capabilityExamples.join("; ")}.`,
    "Pode me mandar do seu jeito.",
  ].join("\n") + pendingHint;
}
