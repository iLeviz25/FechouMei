import type { AgentConversationState } from "@/lib/agent/types";
import { normalizeKnowledgeText } from "@/lib/agent-v2/product-knowledge";
import { isAgentV2SupportedReadIntent } from "@/lib/agent-v2/tool-schemas";

const actualReadPatterns = [
  /\b(me\s+faz|faca|faça|manda|gerar?|gera|quero)\s+(um\s+)?relatorio\b/,
  /\brelatorio\s+(de|do|da|desse|deste|mensal|mes|mês|semana|hoje|ontem)\b/,
  /\bquanto\s+(lucrei|faturei|entrou|saiu|gastei|vendi)\b/,
  /\bcomo\s+foi\s+(meu\s+)?(mes|mês|semana|dia)\b/,
  /\b(ultimas|últimas|recentes)\s+movimentacoes\b/,
  /\bminhas?\s+(entradas|despesas|movimentacoes|movimentações)\b/,
  /\bqual\s+(foi|e|é)\s+(meu\s+)?(lucro|resultado|saldo)\b/,
];

const explanationPatterns = [
  /\b(nao\s+entendi|não\s+entendi|me\s+explica|explica|explique|o\s+que\s+e|o\s+que\s+é|como\s+funciona|como\s+vejo|como\s+ver|pra\s+que\s+serve|para\s+que\s+serve)\b/,
];

const writePatterns = [
  /\b(entrou|recebi|vendi|faturei)\b.*\d/,
  /\b(gastei|paguei|comprei|saiu)\b.*\d/,
  /\b(registra|registre|registrar|lanca|lança|lance|adiciona|adicionar|salva|salvar)\b.*\b(entrada|despesa|gasto|recebimento|movimentacao|movimentação)\b/,
  /\b(entrada|despesa)\b.*\b(de|no valor de)?\s*r?\$?\s*\d/,
];

const dangerousFiscalPatterns = [
  /\b(sonegar|sonegacao|sonegação|fraudar|fraude|nota fria|omitir faturamento|esconder faturamento|burlar imposto)\b/,
];

const outOfScopePatterns = [
  /\b(quem ganhou|placar|jogo ontem|futebol|previsao do tempo|previsão do tempo|receita de|programa em python|codigo em|código em|politica|política|eleicao|eleição)\b/,
];

export type AgentV2RouteSource = "audio_transcript" | "text";

export function shouldAgentV2HandleTextMessage(message: string) {
  if (isAgentV2ActualReadIntent(message)) {
    return isAgentV2SupportedReadIntent(message);
  }

  return true;
}

export function canAgentV2HandleTurn({
  message,
  source,
  state,
}: {
  message: string;
  source: AgentV2RouteSource;
  state?: AgentConversationState | null;
}) {
  if (source !== "text") {
    return false;
  }

  if (state && state.status !== "idle") {
    return false;
  }

  return shouldAgentV2HandleTextMessage(message);
}

export function isAgentV2WriteIntent(message: string) {
  const normalized = normalizeKnowledgeText(message);

  return writePatterns.some((pattern) => pattern.test(normalized));
}

export function isAgentV2ActualReadIntent(message: string) {
  const normalized = normalizeKnowledgeText(message);

  if (isAgentV2ExplanationLike(message)) {
    return false;
  }

  return actualReadPatterns.some((pattern) => pattern.test(normalized));
}

export function isAgentV2ExplanationLike(message: string) {
  const normalized = normalizeKnowledgeText(message);

  return explanationPatterns.some((pattern) => pattern.test(normalized));
}

export function getAgentV2ScopeRefusal(message: string) {
  const normalized = normalizeKnowledgeText(message);

  if (dangerousFiscalPatterns.some((pattern) => pattern.test(normalized))) {
    return [
      "Não posso ajudar com sonegação, fraude ou algo que coloque seu MEI em risco.",
      "",
      "Posso te ajudar a organizar entradas, despesas, relatórios e fechamento mensal dentro do FechouMEI.",
    ].join("\n");
  }

  if (outOfScopePatterns.some((pattern) => pattern.test(normalized))) {
    return [
      "Esse assunto foge um pouco do que eu consigo ajudar por aqui.",
      "",
      "Posso te ajudar com FechouMEI, entradas, despesas, relatórios, fechamento mensal e organização do seu MEI.",
    ].join("\n");
  }

  return null;
}

export function getAgentV2WriteBlockedReply() {
  return [
    "Consigo te ajudar com esse tipo de registro, mas nesta versão de teste da Helena v2 ainda não vou salvar movimentações por aqui.",
    "",
    "Por segurança, ações que gravam dados continuam fora da v2 nesta fase.",
  ].join("\n");
}

export function trimAgentV2Reply(reply: string) {
  const cleaned = reply
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned.length <= 900
    ? cleaned
    : `${cleaned.slice(0, 897).trimEnd()}...`;
}
