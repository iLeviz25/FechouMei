export const helenaEmptyMessageReply = "Me diga o que você quer fazer no FechouMEI.";

export const helenaInstabilityReply =
  "Tive uma instabilidade agora para entender sua mensagem.\nPode tentar de novo em instantes?";

export const helenaProcessingErrorReply =
  "Tive uma instabilidade agora para processar isso.\nPode tentar de novo em instantes?";

export const helenaAudioFallbackReply =
  "Tive uma instabilidade para entender esse áudio agora.\nPode me mandar de novo ou escrever a mensagem por texto?";

export const helenaBasicFallbackReply =
  "Não consegui entender certinho 😅\nVocê quer registrar uma entrada, registrar uma despesa ou consultar algum relatório?";

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
