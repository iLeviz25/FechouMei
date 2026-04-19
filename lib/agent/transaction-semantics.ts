export type SemanticMovementType = "entrada" | "despesa";

type SemanticPattern = {
  pattern: RegExp;
  weight: number;
};

type SemanticAnalysisOptions = {
  hasAmount?: boolean;
};

type SemanticAnalysis = {
  expenseScore: number;
  hasDirectAction: boolean;
  hasGenericAction: boolean;
  incomeScore: number;
  type: SemanticMovementType | null;
};

const directIncomePatterns: SemanticPattern[] = [
  { pattern: /\b(?:entrou|recebi|caiu|ganhei|vendi|veio|faturei|faturou)\b/, weight: 5 },
  { pattern: /\b(?:recebimento|receita)\b/, weight: 4 },
];

const directExpensePatterns: SemanticPattern[] = [
  { pattern: /\b(?:saiu|paguei|gastei|comprei|desembolsei|descontou|custou)\b/, weight: 5 },
  { pattern: /\b(?:boleto|despesa|gasto)\b/, weight: 4 },
];

const genericActionPatterns: SemanticPattern[] = [
  { pattern: /\b(?:registrar|registre|registra|resgitra|lancar|lanca|cadastrar|cadastra|adicionar|adicione|adiciona|colocar|coloca|bota|botar)\b/, weight: 2 },
];

const explicitIncomePatterns: SemanticPattern[] = [
  { pattern: /\b(?:entrada|receita|recebimento)\b/, weight: 5 },
];

const explicitExpensePatterns: SemanticPattern[] = [
  { pattern: /\b(?:despesa|saida|gasto)\b/, weight: 5 },
];

const incomeContextPatterns: SemanticPattern[] = [
  { pattern: /\b(?:cliente|clientes)\b/, weight: 3 },
  { pattern: /\b(?:venda|vendas|vendido)\b/, weight: 3 },
  { pattern: /\b(?:consultoria|freela|freelancer|projeto)\b/, weight: 3 },
  { pattern: /\b(?:servico prestado|prestacao de servico)\b/, weight: 3 },
];

const expenseContextPatterns: SemanticPattern[] = [
  { pattern: /\b(?:internet|telefone|celular|conta de internet)\b/, weight: 3 },
  { pattern: /\b(?:material|materiais|papelaria|insumo|estoque|embalagem)\b/, weight: 3 },
  { pattern: /\b(?:gasolina|combustivel|transporte|uber|onibus|passagem|taxi)\b/, weight: 3 },
  { pattern: /\b(?:alimentacao|comida|refeicao|almoco|lanche|mercado|carne|cafe)\b/, weight: 3 },
  { pattern: /\b(?:imposto|taxa|tributo|das|mei)\b/, weight: 3 },
  { pattern: /\b(?:ferramenta|software|assinatura|sistema|licenca)\b/, weight: 3 },
  { pattern: /\b(?:aluguel|luz|agua)\b/, weight: 3 },
];

export function normalizeSemanticText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

export function inferSemanticTransactionType(
  message: string,
  options: SemanticAnalysisOptions = {},
): SemanticMovementType | null {
  return analyzeSemanticTransactionType(message, options).type;
}

export function analyzeSemanticTransactionType(
  message: string,
  options: SemanticAnalysisOptions = {},
): SemanticAnalysis {
  const normalized = normalizeSemanticText(message);
  const hasAmount = options.hasAmount ?? hasMoneySignal(normalized);
  const directIncomeScore = scorePatterns(normalized, directIncomePatterns);
  const directExpenseScore = scorePatterns(normalized, directExpensePatterns);
  const genericActionScore = scorePatterns(normalized, genericActionPatterns);
  const hasDirectAction = directIncomeScore > 0 || directExpenseScore > 0;
  const hasGenericAction = genericActionScore > 0;

  if (!hasAmount && !hasDirectAction && !hasGenericAction) {
    return {
      expenseScore: 0,
      hasDirectAction,
      hasGenericAction,
      incomeScore: 0,
      type: null,
    };
  }

  const canUseContext = hasAmount || hasDirectAction || hasGenericAction;
  const explicitIncomeScore = hasAmount || hasGenericAction ? scorePatterns(normalized, explicitIncomePatterns) : 0;
  const explicitExpenseScore = hasAmount || hasGenericAction ? scorePatterns(normalized, explicitExpensePatterns) : 0;
  const incomeContextScore = canUseContext ? scorePatterns(normalized, incomeContextPatterns) : 0;
  const expenseContextScore = canUseContext ? scorePatterns(normalized, expenseContextPatterns) : 0;

  const incomeScore = directIncomeScore + explicitIncomeScore + incomeContextScore + genericActionScore;
  const expenseScore = directExpenseScore + explicitExpenseScore + expenseContextScore + genericActionScore;
  const type = chooseType({
    directExpenseScore,
    directIncomeScore,
    expenseScore,
    hasGenericAction,
    incomeScore,
  });

  return {
    expenseScore,
    hasDirectAction,
    hasGenericAction,
    incomeScore,
    type,
  };
}

function chooseType({
  directExpenseScore,
  directIncomeScore,
  expenseScore,
  hasGenericAction,
  incomeScore,
}: {
  directExpenseScore: number;
  directIncomeScore: number;
  expenseScore: number;
  hasGenericAction: boolean;
  incomeScore: number;
}) {
  if (incomeScore >= expenseScore + 2) {
    return "entrada";
  }

  if (expenseScore >= incomeScore + 2) {
    return "despesa";
  }

  if (directIncomeScore > 0 && directExpenseScore === 0) {
    return "entrada";
  }

  if (directExpenseScore > 0 && directIncomeScore === 0) {
    return "despesa";
  }

  if (hasGenericAction && incomeScore > expenseScore) {
    return "entrada";
  }

  if (hasGenericAction && expenseScore > incomeScore) {
    return "despesa";
  }

  return null;
}

function scorePatterns(normalized: string, patterns: SemanticPattern[]) {
  return patterns.reduce((score, pattern) => (pattern.pattern.test(normalized) ? score + pattern.weight : score), 0);
}

function hasMoneySignal(normalized: string) {
  return /\b(?:r\$|\d+(?:[,.]\d{1,2})?|real|reais|conto|contos|mil|cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos)\b/.test(
    normalized,
  );
}
