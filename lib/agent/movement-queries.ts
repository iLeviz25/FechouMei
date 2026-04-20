import type { AgentSpecificMovementQuery, MovementType } from "@/lib/agent/types";
import {
  canonicalizeCategoryInput,
  normalizeText,
} from "@/lib/agent/transaction-parser";

const monthNames: Record<string, number> = {
  abril: 4,
  agosto: 8,
  dezembro: 12,
  fevereiro: 2,
  janeiro: 1,
  julho: 7,
  junho: 6,
  maio: 5,
  marco: 3,
  novembro: 11,
  outubro: 10,
  setembro: 9,
};

const broadCategoryTerms = new Set([
  "alimentacao",
  "cliente",
  "clientes",
  "ferramenta",
  "ferramentas",
  "imposto",
  "impostos",
  "material",
  "materiais",
  "servico",
  "servicos",
  "transporte",
  "transportes",
  "venda",
  "vendas",
]);

export function parseSpecificMovementQuery(message: string): AgentSpecificMovementQuery | null {
  const normalized = normalizeText(message);

  if (!isSpecificMovementQuestion(normalized)) {
    return null;
  }

  const order = parseOrder(normalized);

  if (!order) {
    return null;
  }

  const type = parseMovementType(normalized);
  const category = canonicalizeCategoryInput(normalized)?.category;
  const searchTerm = extractSearchTerm(message, normalized, category);
  const period = parseRelativePeriod(normalized);
  const month = parseMonth(normalized);
  const year = parseYear(normalized);
  const limit = parseLimit(normalized, order.order);
  const requestedField = parseRequestedField(normalized);

  return {
    category,
    limit,
    month,
    order: order.order,
    ordinal: order.ordinal,
    period,
    requestedField,
    searchTerm,
    type,
    year,
  };
}

function isSpecificMovementQuestion(normalized: string) {
  const hasMovementCue =
    /\b(movimentacao|movimentacoes|registro|registros|entrada|entradas|despesa|despesas|gasto|gastos|venda|vendas|paguei|pagamento)\b/.test(
      normalized,
    );
  const hasSpecificCue =
    /\b(primeir|segunda|segundo|terceir|terceiro|ultima|ultimo|ultimas|ultimos|maior|menor|mais antiga|mais recente|antiga|recente|quando|valor)\b/.test(
      normalized,
    );

  return hasMovementCue && hasSpecificCue;
}

function parseOrder(normalized: string): { order: AgentSpecificMovementQuery["order"]; ordinal?: number } | null {
  if (/\b(maior|mais cara|mais alto|mais alta)\b/.test(normalized)) {
    return { order: "highest" };
  }

  if (/\b(menor|mais barata|mais baixo|mais baixa)\b/.test(normalized)) {
    return { order: "lowest" };
  }

  if (/\b(ultimas|ultimos)\b/.test(normalized)) {
    return { order: "latest" };
  }

  if (/\b(ultima|ultimo|mais recente|recente)\b/.test(normalized)) {
    return { order: "latest" };
  }

  if (/\b(segunda|segundo)\b/.test(normalized)) {
    return { order: "nth", ordinal: 2 };
  }

  if (/\b(terceira|terceiro)\b/.test(normalized)) {
    return { order: "nth", ordinal: 3 };
  }

  if (/\b(primeira|primeiro|mais antiga|mais antigo|primeira vez|primeiro registro)\b/.test(normalized)) {
    return { order: "first" };
  }

  if (/\bquando\b/.test(normalized)) {
    return { order: "first" };
  }

  return null;
}

function parseMovementType(normalized: string): MovementType | undefined {
  if (/\b(despesa|despesas|gasto|gastos|paguei|pagamento|saiu)\b/.test(normalized)) {
    return "despesa";
  }

  if (/\b(entrada|entradas|venda|vendas|recebi|recebimento|entrou)\b/.test(normalized)) {
    return "entrada";
  }

  return undefined;
}

function parseLimit(normalized: string, order: AgentSpecificMovementQuery["order"]) {
  const explicit = normalized.match(/\b(?:ultimas|ultimos|primeiras|primeiros)\s+(\d{1,2})\b/);

  if (explicit?.[1]) {
    return Math.max(1, Math.min(Number(explicit[1]), 5));
  }

  return order === "latest" && /\b(ultimas|ultimos)\b/.test(normalized) ? 3 : 1;
}

function parseRequestedField(normalized: string): AgentSpecificMovementQuery["requestedField"] {
  if (/\bquando\b/.test(normalized)) {
    return "date";
  }

  if (/\b(valor|quanto)\b/.test(normalized)) {
    return "amount";
  }

  return "full";
}

function parseRelativePeriod(normalized: string): AgentSpecificMovementQuery["period"] | undefined {
  if (/(este mes|esse mes|neste mes|mes atual|deste mes|desse mes|do mes|no mes)/.test(normalized)) {
    return "this_month";
  }

  if (/(essa semana|esta semana|nesta semana|semana atual|da semana|na semana)/.test(normalized)) {
    return "this_week";
  }

  return undefined;
}

function parseMonth(normalized: string) {
  for (const [name, month] of Object.entries(monthNames)) {
    if (new RegExp(`\\b${name}\\b`).test(normalized)) {
      return month;
    }
  }

  return undefined;
}

function parseYear(normalized: string) {
  const year = normalized.match(/\b(20\d{2})\b/);
  return year?.[1] ? Number(year[1]) : undefined;
}

function extractSearchTerm(message: string, normalized: string, category?: string) {
  const patterns = [
    /\b(?:cliente|fornecedor)\s+([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9\s'-]{1,40})/i,
    /\b(?:com|de|do|da|para|pra|sobre)\s+([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9\s'-]{1,40})/i,
    /\b(?:paguei|recebi)\s+([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9\s'-]{1,40})/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    const cleaned = cleanSearchTerm(match?.[1]);

    if (cleaned && !isOnlyCategory(cleaned, category)) {
      return cleaned;
    }
  }

  void normalized;
  void category;
  return undefined;
}

function cleanSearchTerm(value?: string) {
  if (!value) {
    return undefined;
  }

  const cleaned = value
    .replace(/\b(?:este|esse|essa|deste|desse|dessa|neste|nesse|nessa|mes|semana|foi|valor|primeira|primeiro|ultima|ultimo|maior|menor|vez)\b.*$/i, "")
    .replace(/[?.!,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length >= 2 ? cleaned : undefined;
}

function isOnlyCategory(term: string, category?: string) {
  if (!category) {
    return false;
  }

  const normalized = normalizeText(term);
  return broadCategoryTerms.has(normalized) && canonicalizeCategoryInput(normalized)?.category === category;
}
