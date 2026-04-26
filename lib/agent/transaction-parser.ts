import type { AgentMovementDraft, MovementField, MovementType } from "@/lib/agent/types";
import { getReliableMovementMissingFields, isUsefulMovementDescription } from "@/lib/agent/draft-sufficiency";
import { extractMoneyAmount, stripMoneyExpressions } from "@/lib/agent/money";
import { inferSemanticTransactionType } from "@/lib/agent/transaction-semantics";
import { parseSpokenNumberPtBr } from "@/lib/agent/spoken-number";
import { normalizeSpokenAgentMessage } from "@/lib/agent/spoken-text";
import { toDateInputValue } from "@/lib/agent/utils";

export type MovementCategory =
  | "Cliente"
  | "Serviço"
  | "Venda"
  | "Material"
  | "Ferramenta"
  | "Imposto"
  | "Transporte"
  | "Alimentação"
  | "Outro";

export type ParsedTransaction = {
  confidence: "high" | "medium" | "low";
  draft: AgentMovementDraft;
  missingFields: MovementField[];
};

type CategoryInference = {
  category: MovementCategory;
  confidence: "high" | "medium" | "low";
  matchedText?: string;
  matchKind?: "alias" | "fuzzy" | "fallback";
};

type SourceEntity = {
  category?: MovementCategory;
  confidence: "high" | "medium" | "low";
  description: string;
};

const officialCategories: MovementCategory[] = [
  "Cliente",
  "Serviço",
  "Venda",
  "Material",
  "Ferramenta",
  "Imposto",
  "Transporte",
  "Alimentação",
  "Outro",
];

const categoryAliases: Record<MovementCategory, string[]> = {
  Cliente: ["cliente", "clientes"],
  Serviço: [
    "serviço",
    "servico",
    "serviços",
    "servicos",
    "internet",
    "luz",
    "água",
    "agua",
    "telefone",
    "celular",
    "domínio",
    "dominio",
    "hospedagem",
    "contador",
    "contabilidade",
    "consultoria",
    "manutencao",
    "reparo",
    "conserto",
    "tráfego",
    "trafego",
    "anúncio",
    "anuncio",
    "ads",
    "meta ads",
    "google ads",
    "tiktok ads",
    "marketing",
    "conta de internet",
    "conta de luz",
    "conta de agua",
    "servico prestado",
    "prestacao de servico",
    "prestacao",
    "freela",
    "freelancer",
    "projeto",
  ],
  Venda: ["venda", "vendas", "pedido", "pedidos", "produto", "produtos", "recebimento", "receita"],
  Material: [
    "material",
    "materiais",
    "compra de material",
    "material de escritorio",
    "insumo",
    "insumos",
    "papelaria",
    "estoque",
    "embalagem",
    "embalagens",
    "fornecedor",
    "fornecedores",
    "compra de fornecedor",
  ],
  Ferramenta: ["ferramenta", "ferramentas", "software", "softwares", "assinatura", "assinaturas", "app", "sistema", "licença", "licenca"],
  Imposto: ["imposto", "impostos", "taxa", "taxas", "tributo", "tributos", "das", "mei"],
  Transporte: ["transporte", "transportes", "uber", "gasolina", "combustivel", "passagem", "passagens", "frete", "entrega", "motoboy", "ônibus", "onibus", "taxi", "táxi", "99"],
  Alimentação: [
    "alimentação",
    "alimentacao",
    "comida",
    "refeição",
    "refeicao",
    "refeições",
    "refeicoes",
    "almoço",
    "almoco",
    "jantar",
    "lanche",
    "ifood",
    "i food",
    "restaurante",
    "padaria",
    "mercado",
    "carne",
    "melancia",
    "fruta",
    "frutas",
    "café",
    "cafe",
  ],
  Outro: ["outro", "outros"],
};

categoryAliases["Serviço"].push("energia");
categoryAliases.Material.push("materia prima", "materia-prima");
categoryAliases.Ferramenta.push(
  "canva",
  "canva pro",
  "prego",
  "pregos",
  "martelo",
  "furadeira",
  "chave de fenda",
  "parafuso",
  "parafusos",
  "alicate",
);
categoryAliases["Alimentação"].push("hamburguer", "hamburger", "hambúrguer", "pizza", "pastel");

export function getOfficialMovementCategories() {
  return [...officialCategories];
}

const categoryEchoAliases: Record<MovementCategory, string[]> = {
  Cliente: ["cliente", "clientes"],
  Serviço: ["serviço", "servico", "serviços", "servicos"],
  Venda: ["venda", "vendas"],
  Material: ["material", "materiais"],
  Ferramenta: ["ferramenta", "ferramentas"],
  Imposto: ["imposto", "impostos", "taxa", "taxas", "tributo", "tributos"],
  Transporte: ["transporte", "transportes"],
  Alimentação: ["alimentação", "alimentacao"],
  Outro: ["outro", "outros"],
};

const categoryEchoCanonicalLabels: Record<MovementCategory, string> = {
  Cliente: "cliente",
  Serviço: "serviço",
  Venda: "venda",
  Material: "material",
  Ferramenta: "ferramenta",
  Imposto: "imposto",
  Transporte: "transporte",
  Alimentação: "alimentação",
  Outro: "outro",
};

const serviceSpecificItems = new Set([
  "agua",
  "celular",
  "contabilidade",
  "contador",
  "dominio",
  "hospedagem",
  "internet",
  "luz",
  "telefone",
]);

const expenseVerbs = [
  "assinei",
  "assinatura",
  "compra",
  "comprado",
  "paguei",
  "pagar",
  "pagamento",
  "pago",
  "gastei",
  "gasto",
  "comprei",
  "debito",
  "dÃ©bito",
  "desembolsei",
  "saiu",
  "foi",
  "custou",
  "boleto",
  "despesa",
  "peguei",
  "descontou",
  "uber",
];

const incomeVerbs = [
  "credito",
  "crÃ©dito",
  "entrou",
  "recebi",
  "caiu",
  "ganhei",
  "faturou",
  "faturei",
  "vendi",
  "veio",
  "recebimento",
  "receita",
  "entrada",
  "pix recebido",
  "transferencia recebida",
  "transferÃªncia recebida",
  "cliente pagou",
  "reembolso recebido",
];

const operationalPhrasePatterns = [
  /\b(?:me ajuda|ajuda)\b/gi,
  /\b(?:e\s+)?(?:deu|ficou|totalizou)\b/gi,
  /\badiciona\s+a[ií]\b/gi,
  /\b(?:agora|adicione|adiciona|adicionar|bota|botar|registre|registra|resgitra|registrar|lança|lanca|lançar|lancar|lance|coloca|colocar|cadastra|cadastre|cadastrar|faz|fazer|fa[çc]a|cria|crie|criar)\b/gi,
  /\b(?:por favor|porfavor|pra mim|para mim)\b/gi,
  /\b(?:que\s+)?(?:eu\s+)?(?:recebi|paguei|gastei|comprei)\b/gi,
  /\b(?:pagar|pago|pagamento|gasto|compra|comprado|lancei|lancado|lanÃ§ado|registrei|registrado)\b/gi,
  /\bque\s+(?:entrou|saiu|caiu|foi)\b/gi,
  /\b(?:tive|entrou|caiu|veio|saiu|foi|custou|descontou|boleto|despesa|entrada|vendi|faturei|faturou|ganhei|peguei)\b/gi,
  /\bcomo\s+(?:entrada|despesa)\b/gi,
  /\b(?:do meu|da minha|dos meus|das minhas|meu|minha)\b/gi,
  /\b(?:valor|que)\b/gi,
  /\b(?:uma|um)\s+(?:entrada|despesa)\b/gi,
];

const clientEntityPatterns = [
  /\b(?:do|da|de|para|pra|pro)\s+(?:meu|minha)?\s*cliente\s+(.+?)(?=$|[,.!?]|\s+(?:hoje|ontem|dia|no\s+dia|na\s+data|por\s+favor|pra\s+mim|para\s+mim))/i,
  /\bcliente\s+(.+?)(?=$|[,.!?]|\s+(?:hoje|ontem|dia|no\s+dia|na\s+data|por\s+favor|pra\s+mim|para\s+mim))/i,
];

const incomeSourceEntityPatterns = [
  /\b(?:do|da|de)\s+(.+?)(?=$|[,.!?]|\s+(?:hoje|ontem|dia|no\s+dia|na\s+data|por\s+favor|pra\s+mim|para\s+mim))/i,
];

const fillerTokens = new Set([
  "a",
  "as",
  "o",
  "os",
  "uma",
  "um",
  "de",
  "do",
  "da",
  "dos",
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "pela",
  "pelo",
  "pelas",
  "pelos",
  "com",
  "como",
  "ao",
  "aos",
  "cria",
  "criar",
  "crie",
  "faca",
  "fazer",
  "faz",
  "lance",
  "lancamento",
  "movimentacao",
  "por",
  "para",
  "pra",
  "reais",
  "real",
  "brl",
  "r$",
  "rs",
  "pode",
  "essa",
  "esse",
  "isso",
  "mano",
  "aqui",
  "ai",
  "aí",
  "registro",
]);

const categoryAliasEntries = buildCategoryAliasEntries();
const categorySearchEntries = categoryAliasEntries
  .filter((entry) => entry.category !== "Outro")
  .sort((a, b) => b.normalized.length - a.normalized.length);

const obviousExpenseKeywords = categorySearchEntries
  .filter((entry) => entry.category !== "Cliente" && entry.category !== "Venda")
  .map((entry) => entry.normalized);

const transactionClauseSeparator =
  /(?:[,;]|\s+(?:e|tambem|também|alem disso|além disso|depois|junto com isso)\s+)(?=\s*(?:mano\s+)?(?:recebi|entrou|caiu|veio|ganhei|faturou|faturei|vendi|entrada|paguei|gastei|comprei|desembolsei|descontou|saiu|despesa|boleto|bota|coloca|adiciona|adicione|registra|registre|registrar|resgitra|cadastra|cadastre|cadastrar|lan[çc]a|lancar))/gi;

export function parseTransactionMessage(message: string, forcedType?: MovementType): ParsedTransaction | null {
  const spokenMessage = isolateWriteSegmentFromMixedRead(normalizeSpokenAgentMessage(message));
  const type = forcedType ?? inferTransactionType(spokenMessage);

  if (!type) {
    return null;
  }

  const amount = extractMoneyPtBr(spokenMessage);
  const sourceEntity = extractSourceEntity(spokenMessage, type);
  const description = sourceEntity?.description ?? cleanTransactionDescription(spokenMessage, type);
  const category = description
    ? sourceEntity?.category
      ? { category: sourceEntity.category, confidence: sourceEntity.confidence, matchKind: "alias" as const }
      : decideCategoryWithConfidence(description, { allowFallback: false })
    : null;
  const draft: AgentMovementDraft = {
    type,
    occurred_on: extractSimpleDate(spokenMessage),
  };

  if (amount) {
    draft.amount = amount;
  }

  if (description) {
    draft.description = cleanDescriptionUsingResolvedCategory(description, category?.category, category?.confidence);
  }

  if (category?.confidence === "high" || category?.confidence === "medium") {
    draft.category = category.category;
  }

  const missingFields = getPracticalMissingFields(draft);

  return {
    confidence: calculateConfidence({ category, draft, missingFields }),
    draft,
    missingFields,
  };
}

export function parseTransactionMessages(message: string): ParsedTransaction[] {
  const spokenMessage = normalizeSpokenAgentMessage(message);
  const parsed = splitTransactionClauses(spokenMessage)
    .map(isolateWriteSegmentFromMixedRead)
    .map((clause) => parseTransactionMessage(clause))
    .filter((transaction): transaction is ParsedTransaction => Boolean(transaction));

  if (parsed.length > 1) {
    return parsed;
  }

  const single = parseTransactionMessage(stripTrailingReadQuery(spokenMessage));
  return single ? [single] : [];
}

export function inferCategoryFromDescription(description?: string, _type?: MovementType) {
  if (!description) {
    return null;
  }

  return decideCategoryWithConfidence(description, { allowFallback: false });
}

export function canonicalizeCategoryInput(category?: string) {
  if (!category) {
    return null;
  }

  return decideCategoryWithConfidence(category, { allowFallback: false });
}

export function extractSourceEntity(message: string, type?: MovementType): SourceEntity | null {
  const withoutMoney = stripMoneyPhrase(message);

  for (const pattern of clientEntityPatterns) {
    const match = withoutMoney.match(pattern);
    const entity = cleanupEntityName(match?.[1]);

    if (entity) {
      return {
        category: "Cliente",
        confidence: "high",
        description: entity,
      };
    }
  }

  if (type === "entrada") {
    for (const pattern of incomeSourceEntityPatterns) {
      const match = withoutMoney.match(pattern);
      const entity = cleanupEntityName(match?.[1]);

      if (entity) {
        return {
          category: "Cliente",
          confidence: "medium",
          description: entity,
        };
      }
    }
  }

  return null;
}

export function cleanTransactionDescription(message: string, type?: MovementType) {
  const sourceEntity = extractSourceEntity(message, type);

  if (sourceEntity) {
    return sourceEntity.description;
  }

  const noOperationalText = stripCommandDescriptionNoise(
    stripDescriptionDateNoise(stripOperationalPhrases(stripMoneyPhrase(message))),
  );
  const compacted = stripBoundaryFillers(noOperationalText)
    .replace(/^\s*(?:paguei|pagar|pago|pagamento|gastei|gasto|comprei|compra|comprado|recebi|entrou|caiu|vendi|credito|debito)\b\s*/i, " ")
    .replace(/^\s*(?:de|do|da|dos|das|com|em|no|na|para|pra|pro|por|pela|pelo)\s+/i, " ")
    .replace(/[?!.,;:]+/g, " ")
    .replace(/\b(?:de|com)\s+(?:de|com)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return isUsefulMovementDescription(compacted) ? compacted : undefined;
}

export function cleanDescriptionUsingResolvedCategory(
  description: string,
  category?: string,
  confidence: "high" | "medium" | "low" = "high",
) {
  const canonicalCategory = toOfficialCategory(category);
  const compactedDescription = stripBoundaryFillers(description)
    .replace(/\s+/g, " ")
    .trim();

  if (!canonicalCategory || !compactedDescription) {
    return compactedDescription;
  }

  if (confidence !== "high") {
    return compactedDescription;
  }

  const echoPrefix = getCategoryEchoPrefix(compactedDescription, canonicalCategory);

  if (!echoPrefix) {
    return maybeCanonicalizeSingleTokenDescription(compactedDescription, canonicalCategory);
  }

  if (!echoPrefix.rest) {
    return echoPrefix.canonicalPrefix;
  }

  if (shouldReduceCategoryEcho(canonicalCategory, echoPrefix.rest)) {
    return echoPrefix.rest;
  }

  return [echoPrefix.canonicalPrefix, echoPrefix.connector, echoPrefix.rest].filter(Boolean).join(" ");
}

export function extractMoneyPtBr(message: string) {
  return extractMoneyAmount(message) ?? parseSpokenNumberPtBr(message);
}

export function inferTransactionType(message: string): MovementType | null {
  const normalized = normalizeAgentInput(message);
  const hasAmount = Boolean(extractMoneyPtBr(message));
  const semanticType = inferSemanticTransactionType(message, { hasAmount });

  if (semanticType) {
    return semanticType;
  }

  const hasDirectAction = /\b(?:recebi|entrou|caiu|veio|ganhei|vendi|faturei|faturou|credito|pix recebido|transferencia recebida|cliente pagou|paguei|pagar|pago|pagamento|gastei|gasto|compra|comprei|saiu|debito|descontou|desembolsei|custou)\b/.test(
    normalized,
  );

  if (!hasAmount && !hasOperationalVerb(normalized) && !hasDirectAction) {
    return null;
  }

  const hasExpenseVerb = expenseVerbs.some((verb) => normalized.includes(normalizeAgentInput(verb)));
  const hasIncomeVerb = incomeVerbs.some((verb) => normalized.includes(normalizeAgentInput(verb)));

  if (hasExpenseVerb && !hasIncomeVerb) {
    return "despesa";
  }

  if (hasIncomeVerb && !hasExpenseVerb) {
    return "entrada";
  }

  if (!hasExpenseVerb && !hasIncomeVerb && hasOperationalVerb(normalized)) {
    const looksLikeExpense = obviousExpenseKeywords.some((keyword) => normalized.includes(keyword));

    if (looksLikeExpense) {
      return "despesa";
    }

    if (/\b(?:do|da|de)\s+[a-z0-9]/.test(normalized)) {
      return "entrada";
    }
  }

  return null;
}

export function normalizeAgentInput(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function normalizeText(value: string) {
  return normalizeAgentInput(value);
}

function decideCategoryWithConfidence(
  text: string,
  options: { allowFallback?: boolean } = {},
): CategoryInference | null {
  const exactMatch = canonicalizeCategoryByAlias(text);

  if (exactMatch) {
    return exactMatch;
  }

  const fuzzyMatch = fuzzyMatchCategory(text);

  if (fuzzyMatch) {
    return fuzzyMatch;
  }

  if (options.allowFallback && normalizeAgentInput(text).length >= 2) {
    return {
      category: "Outro",
      confidence: "medium",
      matchKind: "fallback",
    };
  }

  return null;
}

function canonicalizeCategoryByAlias(text: string): CategoryInference | null {
  const tokens = getNormalizedTokens(text);

  for (const entry of categorySearchEntries) {
    if (containsTokenSequence(tokens, entry.tokens)) {
      return {
        category: entry.category,
        confidence: "high",
        matchedText: entry.alias,
        matchKind: "alias",
      };
    }
  }

  for (const token of tokens) {
    const singularToken = singularizePtBr(token);
    const matchedEntry = categoryAliasEntries.find((entry) => entry.normalized === singularToken);

    if (matchedEntry) {
      return {
        category: matchedEntry.category,
        confidence: "high",
        matchedText: matchedEntry.alias,
        matchKind: "alias",
      };
    }
  }

  return null;
}

function fuzzyMatchCategory(text: string): CategoryInference | null {
  const tokens = getNormalizedTokens(text);

  for (const token of tokens) {
    if (token.length < 5) {
      continue;
    }

    let bestMatch: { category: MovementCategory; distance: number; alias: string } | null = null;

    for (const entry of categoryAliasEntries) {
      if (entry.category === "Outro" || entry.normalized.length < 5) {
        continue;
      }

      const distance = levenshteinDistance(token, entry.normalized);
      const maxDistance = entry.normalized.length >= 9 ? 2 : 1;

      if (distance <= maxDistance && (!bestMatch || distance < bestMatch.distance)) {
        bestMatch = {
          alias: entry.alias,
          category: entry.category,
          distance,
        };
      }
    }

    if (bestMatch) {
      return {
        category: bestMatch.category,
        confidence: "high",
        matchedText: bestMatch.alias,
        matchKind: "fuzzy",
      };
    }
  }

  return null;
}

function extractSimpleDate(message: string) {
  return extractExplicitDatePtBr(message) ?? toDateInputValue(new Date());
}

export function extractExplicitDatePtBr(message: string) {
  const normalized = normalizeAgentInput(message);
  const dateMatch = normalized.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);

  if (normalized.includes("ontem")) {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return toDateInputValue(date);
  }

  if (dateMatch) {
    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const rawYear = dateMatch[3] ? Number(dateMatch[3]) : new Date().getFullYear();
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    const date = new Date(year, month - 1, day);

    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return toDateInputValue(date);
    }
  }

  if (normalized.includes("hoje")) {
    return toDateInputValue(new Date());
  }

  return null;
}

function splitTransactionClauses(message: string) {
  return message
    .split(transactionClauseSeparator)
    .map(stripTrailingReadQuery)
    .map(isolateWriteSegmentFromMixedRead)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);
}

function isolateWriteSegmentFromMixedRead(message: string) {
  const normalized = normalizeAgentInput(message);
  const hasReadIntent = /\b(?:limite|mei|resumo|saldo|movimentacao|movimentacoes|movimentacao do mes|movimentacoes do mes|como esta|como foi|pendencia|pendencias|obrigacoes|registros)\b/.test(normalized);

  if (!hasReadIntent) {
    return message;
  }

  const writeStart = message.search(/\b(?:registrar|registre|registra|resgitra|adicionar|adicione|adiciona|bota|coloca|cadastra|cadastre|cadastrar|lan[çc]a|lancar|recebi|entrou|caiu|veio|ganhei|faturei|faturou|vendi|paguei|gastei|comprei|desembolsei|descontou|saiu)\b/i);

  if (writeStart <= 0) {
    return message;
  }

  return message.slice(writeStart).trim();
}

function stripTrailingReadQuery(message: string) {
  return message
    .replace(/\s+e\s+(?:como|qual|quais|mostra|mostre|me\s+mostra|consulta|consulte|ver|veja)\b.*$/i, "")
    .trim();
}

function getPracticalMissingFields(draft: AgentMovementDraft): MovementField[] {
  return getReliableMovementMissingFields(draft);
}

function calculateConfidence({
  category,
  draft,
  missingFields,
}: {
  category: CategoryInference | null;
  draft: AgentMovementDraft;
  missingFields: MovementField[];
}) {
  if (missingFields.length > 0) {
    return missingFields.includes("amount") || missingFields.includes("description") ? "low" : "medium";
  }

  if (draft.type && draft.amount && draft.description && category?.confidence === "high") {
    return "high";
  }

  return "medium";
}

function stripMoneyPhrase(message: string) {
  return stripMoneyExpressions(message);
}

function stripOperationalPhrases(message: string) {
  let cleaned = message;

  for (const pattern of operationalPhrasePatterns) {
    cleaned = cleaned.replace(pattern, " ");
  }

  return cleaned.replace(/\s+/g, " ").trim();
}

function stripDescriptionDateNoise(message: string) {
  return message
    .replace(/\b(?:hoje|ontem)\b/gi, " ")
    .replace(/\b(?:dia|no dia|na data)\s+\d{1,2}(?:\/\d{1,2}(?:\/\d{2,4})?)?\b/gi, " ");
}

function stripCommandDescriptionNoise(message: string) {
  return message
    .replace(/^\s*(?:fa[çc]a|faz|fazer|cria|crie|criar|adicione|adiciona|adicionar|bota|botar|coloca|colocar|registre|registra|resgitra|registrar|cadastra|cadastre|cadastrar|lan[çc]a|lanca|lance|lan[çc]ar|lancar)\b\s*/i, " ")
    .replace(/^\s*(?:uma|um)?\s*(?:entrada|despesa|movimentacao|movimentações|movimentacoes|lancamento|lançamento|registro)\b\s*(?:de|com)?\s*/i, " ")
    .replace(/^\s*(?:de|com)\s+/i, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripBoundaryFillers(message: string) {
  let tokens = message.split(/\s+/).filter(Boolean);

  while (tokens.length > 0 && fillerTokens.has(normalizeAgentInput(tokens[0]))) {
    tokens = tokens.slice(1);
  }

  while (tokens.length > 0 && fillerTokens.has(normalizeAgentInput(tokens[tokens.length - 1]))) {
    tokens = tokens.slice(0, -1);
  }

  while (tokens.length > 1 && fillerTokens.has(normalizeAgentInput(tokens[0]))) {
    tokens = tokens.slice(1);
  }

  return tokens.join(" ");
}

function cleanupEntityName(value?: string) {
  if (!value) {
    return null;
  }

  const cleaned = stripBoundaryFillers(stripOperationalPhrases(stripMoneyPhrase(value)))
    .replace(/\b(?:hoje|ontem|por favor|porfavor|pra mim|para mim)\b.*$/i, " ")
    .replace(/^\s*(?:o|a|os|as|meu|minha|do|da|de|dos|das|para|pra|pro)\s+/i, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length >= 2 ? cleaned : null;
}

function getNormalizedTokens(text: string) {
  return normalizeAgentInput(text)
    .split(/[^a-z0-9]+/i)
    .map((token) => singularizePtBr(token))
    .filter((token) => token.length > 1 && !fillerTokens.has(token));
}

function singularizePtBr(token: string) {
  if (token.endsWith("oes") && token.length > 4) {
    return `${token.slice(0, -3)}ao`;
  }

  if (token.endsWith("ais") && token.length > 4) {
    return `${token.slice(0, -3)}al`;
  }

  if (token.endsWith("eis") && token.length > 4) {
    return `${token.slice(0, -3)}el`;
  }

  if (token.endsWith("s") && token.length > 3) {
    return token.slice(0, -1);
  }

  return token;
}

function buildCategoryAliasEntries() {
  return officialCategories.flatMap((category) =>
    categoryAliases[category].map((alias) => ({
      alias,
      category,
      normalized: singularizePtBr(normalizeAgentInput(alias)),
      tokens: getNormalizedTokens(alias),
    })),
  );
}

function containsTokenSequence(tokens: string[], sequence: string[]) {
  if (sequence.length === 0 || sequence.length > tokens.length) {
    return false;
  }

  return tokens.some((_, index) => sequence.every((token, sequenceIndex) => tokens[index + sequenceIndex] === token));
}

function toOfficialCategory(category?: string): MovementCategory | null {
  if (!category) {
    return null;
  }

  if (officialCategories.includes(category as MovementCategory)) {
    return category as MovementCategory;
  }

  return canonicalizeCategoryInput(category)?.category ?? null;
}

function getCategoryEchoPrefix(description: string, category: MovementCategory) {
  const tokens = description.split(/\s+/).filter(Boolean);
  const firstToken = tokens[0];

  if (!firstToken || !isCategoryEchoToken(firstToken, category)) {
    return null;
  }

  const restTokens = tokens.slice(1);
  const connector = isConnector(restTokens[0]) ? restTokens.shift() : undefined;
  const rest = stripBoundaryFillers(restTokens.join(" "))
    .replace(/\s+/g, " ")
    .trim();

  return {
    canonicalPrefix: categoryEchoCanonicalLabels[category],
    connector,
    rest,
  };
}

function isCategoryEchoToken(token: string, category: MovementCategory) {
  const normalizedToken = singularizePtBr(normalizeAgentInput(token));

  return categoryEchoAliases[category].some((alias) => {
    const normalizedAlias = singularizePtBr(normalizeAgentInput(alias));
    const distance = levenshteinDistance(normalizedToken, normalizedAlias);
    const maxDistance = normalizedAlias.length >= 9 ? 2 : 1;

    return normalizedToken === normalizedAlias || (normalizedToken.length >= 5 && distance <= maxDistance);
  });
}

function isConnector(token?: string) {
  return Boolean(token && ["com", "da", "das", "de", "do", "dos", "em", "na", "no", "para", "pra"].includes(normalizeAgentInput(token)));
}

function shouldReduceCategoryEcho(category: MovementCategory, rest: string) {
  if (category === "Cliente") {
    return true;
  }

  if (category !== "Serviço") {
    return false;
  }

  const [firstToken] = getNormalizedTokens(rest);
  return Boolean(firstToken && serviceSpecificItems.has(firstToken));
}

function maybeCanonicalizeSingleTokenDescription(description: string, category: MovementCategory) {
  const tokens = description.split(/\s+/).filter(Boolean);

  if (tokens.length !== 1) {
    return description;
  }

  return isCategoryEchoToken(tokens[0], category) ? categoryEchoCanonicalLabels[category] : description;
}

function levenshteinDistance(a: string, b: string) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }

    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[b.length];
}

function hasOperationalVerb(normalized: string) {
  return /\b(adicione|adiciona|adicionar|bota|botar|registre|registra|resgitra|registrar|lança|lanca|lançar|lancar|coloca|colocar|cadastra|cadastre|cadastrar)\b/.test(normalized);
}
