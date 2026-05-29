export const helenaEmptyMessageReply = "Me diga o que você quer fazer no FechouMEI.";

export const helenaInstabilityReply =
  "Tive uma instabilidade agora para entender sua mensagem.\nPode tentar de novo em instantes?";

export const helenaProcessingErrorReply =
  "Tive uma instabilidade agora para processar isso.\nPode tentar de novo em instantes?";

export const helenaAudioFallbackReply =
  "Tive uma instabilidade para entender esse áudio agora.\nPode me mandar de novo ou escrever a mensagem por texto?";

export const helenaBasicFallbackReply =
  "Não consegui entender certinho 😅\nVocê quer registrar uma entrada, registrar uma despesa ou consultar algum relatório?";

export const helenaMonthlyClosingExplanationReply = [
  "Claro. O fechamento mensal é a parte onde você confere como ficou o mês do seu MEI:",
  "quanto entrou, quanto saiu e qual foi o resultado.",
  "",
  "Ele ajuda você a encerrar o mês com mais clareza, sem depender só de memória ou planilha.",
].join("\n");

export const helenaReportExplanationReply = [
  "Claro. O relatório mostra um resumo de um período:",
  "entradas, despesas, resultado e movimentações registradas.",
  "",
  "Você pode pedir, por exemplo: “relatório desse mês” ou “relatório de abril”.",
].join("\n");

export const helenaProfitExplanationReply = [
  "Claro. No FechouMEI, o resultado do mês é a diferença entre entradas e despesas.",
  "",
  "Para consultar pelo WhatsApp, você pode perguntar: “quanto lucrei esse mês?” ou “como foi meu mês?”.",
].join("\n");

export function formatDisplayTextForWhatsApp(value?: string | null, fallback = "Outros") {
  const trimmed = value?.trim().replace(/\s+/g, " ") || fallback;
  const sentence = shouldSentenceCase(trimmed)
    ? trimmed.toLocaleLowerCase("pt-BR")
    : trimmed;

  return capitalizeFirstLetter(restoreCommonPortugueseAccents(sentence));
}

function shouldSentenceCase(value: string) {
  return /[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]/.test(value) && value === value.toLocaleUpperCase("pt-BR");
}

function capitalizeFirstLetter(value: string) {
  return value.replace(/^(\p{Letter})/u, (letter) => letter.toLocaleUpperCase("pt-BR"));
}

function restoreCommonPortugueseAccents(value: string) {
  return value
    .replace(/\btransferencia\b/g, "transferência")
    .replace(/\bmovimentacao\b/g, "movimentação")
    .replace(/\bmovimentacoes\b/g, "movimentações")
    .replace(/\bdescricao\b/g, "descrição")
    .replace(/\bservico\b/g, "serviço")
    .replace(/\bservicos\b/g, "serviços")
    .replace(/\bmanutencao\b/g, "manutenção")
    .replace(/\balimentacao\b/g, "alimentação")
    .replace(/\bobrigacao\b/g, "obrigação")
    .replace(/\bobrigacoes\b/g, "obrigações")
    .replace(/\bmes\b/g, "mês")
    .replace(/\bperiodo\b/g, "período")
    .replace(/\bcomissao\b/g, "comissão")
    .replace(/\bcartao\b/g, "cartão")
    .replace(/\bcredito\b/g, "crédito")
    .replace(/\bdebito\b/g, "débito")
    .replace(/\beletronico\b/g, "eletrônico")
    .replace(/\bcombustivel\b/g, "combustível")
    .replace(/\bcontabil\b/g, "contábil");
}

export function getHelenaProductQuestionReply(message: string) {
  const normalized = normalizeReplyIntentText(message);

  if (!isExplanationQuestion(normalized)) {
    return null;
  }

  if (/\b(fechamento mensal|fechamento|fechar o mes|fechar meu mes)\b/.test(normalized)) {
    return helenaMonthlyClosingExplanationReply;
  }

  if (/\b(relatorio|relatorios|resumo)\b/.test(normalized)) {
    return helenaReportExplanationReply;
  }

  if (/\b(lucro|lucrei|resultado|saldo)\b/.test(normalized)) {
    return helenaProfitExplanationReply;
  }

  return null;
}

function normalizeReplyIntentText(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isExplanationQuestion(normalized: string) {
  return /\b(nao entendi|me explica|explica|explique|o que e|que e|como funciona|pra que serve|para que serve|tenho duvida|duvida|nao sei)\b/.test(normalized);
}
