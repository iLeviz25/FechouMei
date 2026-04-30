import type {
  AgentConversationState,
  AgentMovementDraft,
  MovementField,
  MovementType,
} from "@/lib/agent/types";
import { extractMoneyAmount } from "@/lib/agent/money";
import { parseSpokenNumberPtBr } from "@/lib/agent/spoken-number";

export const MEI_ANNUAL_LIMIT = 81000;

const fieldLabels: Record<MovementField, string> = {
  amount: "do valor",
  category: "da categoria",
  description: "da descrição/origem",
  occurred_on: "da data",
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency",
});

export function toCurrency(value: number) {
  return currencyFormatter.format(value);
}

export function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateLabel(value: string) {
  const todayValue = toDateInputValue(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (value === todayValue) {
    return "hoje";
  }

  if (value === toDateInputValue(yesterday)) {
    return "ontem";
  }

  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

export function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
}

export function getCurrentMonthRange(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return {
    end: toDateInputValue(end),
    key: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    label: formatMonthLabel(now),
    start: toDateInputValue(start),
  };
}

export function getCurrentYearRange(now = new Date()) {
  return {
    end: toDateInputValue(new Date(now.getFullYear(), 11, 31)),
    start: toDateInputValue(new Date(now.getFullYear(), 0, 1)),
  };
}

export function normalizeMovementDraft(
  draft: AgentMovementDraft,
  type: MovementType,
  today = toDateInputValue(new Date()),
): AgentMovementDraft {
  const amount = Number(draft.amount);
  const normalized: AgentMovementDraft = {
    type,
    occurred_on: isValidDateInput(draft.occurred_on) ? draft.occurred_on : today,
  };

  if (Number.isFinite(amount) && amount > 0) {
    normalized.amount = Math.round(amount * 100) / 100;
  }

  if (typeof draft.description === "string" && draft.description.trim()) {
    normalized.description = draft.description.trim();
  }

  if (typeof draft.category === "string" && draft.category.trim()) {
    normalized.category = draft.category.trim();
  }

  return normalized;
}

export function getMissingMovementFields(draft: AgentMovementDraft): MovementField[] {
  const missing: MovementField[] = [];

  if (!draft.amount || draft.amount <= 0) {
    missing.push("amount");
  }

  if (!draft.description) {
    missing.push("description");
  }

  if (!draft.category) {
    missing.push("category");
  }

  if (!draft.occurred_on) {
    missing.push("occurred_on");
  }

  return missing;
}

export function getMissingFieldsQuestion(type: MovementType, missingFields: MovementField[]) {
  const label = type === "entrada" ? "essa entrada" : "essa despesa";
  const missingLabels = missingFields.map((field) => fieldLabels[field]);

  if (missingFields.length === 1) {
    if (missingFields[0] === "amount") {
      return "Qual foi o valor?";
    }

    if (missingFields[0] === "description") {
      return type === "entrada" ? "De onde veio essa entrada?" : "Qual foi a despesa?";
    }

    if (missingFields[0] === "category") {
      return "Qual categoria devo usar?";
    }

    if (missingFields[0] === "occurred_on") {
      return "Qual foi a data?";
    }
  }

  if (missingLabels.length === 1) {
    return `Preciso só ${missingLabels[0]} para registrar ${label}.`;
  }

  return `Preciso ${missingLabels.slice(0, -1).join(", ")} e ${missingLabels.at(-1)} para registrar ${label}.`;
}

export function getMovementConfirmationMessage(draft: AgentMovementDraft) {
  const typeLabel = draft.type === "entrada" ? "entrada" : "despesa";
  const connector = draft.type === "entrada" ? "de" : "em";

  return `Entendi: ${typeLabel} de ${toCurrency(draft.amount ?? 0)} ${connector} ${draft.description}, categoria ${draft.category}, ${formatDateLabel(draft.occurred_on ?? toDateInputValue(new Date()))}. Posso registrar?`;
}

export function emptyAgentState(): AgentConversationState {
  return {
    status: "idle",
    updatedAt: new Date().toISOString(),
  };
}

export function makeAgentState(state: Omit<AgentConversationState, "updatedAt">): AgentConversationState {
  return {
    ...state,
    updatedAt: new Date().toISOString(),
  };
}

export function detectConfirmation(message: string): "yes" | "no" | "unclear" {
  const normalized = normalizeConfirmationText(message);

  if (/^(sim|s|ok|pode|pode ser|pode fazer|pode confirmar|confirmo|confirma|confirmar|isso|isso mesmo|correto|manda|salva|salvar)\b/.test(normalized)) {
    return "yes";
  }

  if (/^(nao|n|cancelar|cancela|cancele|deixa pra la|esquece|esquece isso|melhor nao|errado|nao confirma)\b/.test(normalized)) {
    return "no";
  }

  return "unclear";
}

export function mergeDraftWithPlainAnswer(
  currentDraft: AgentMovementDraft,
  message: string,
  missingFields: MovementField[] = [],
) {
  const next = { ...currentDraft };
  const trimmedMessage = message.trim();

  if (!trimmedMessage) {
    return next;
  }

  if (missingFields.includes("amount") && !next.amount) {
    const amount = parseAmountFromText(trimmedMessage);

    if (amount) {
      next.amount = amount;
    }
  }

  if (missingFields.length === 1 && missingFields[0] === "description" && !next.description) {
    next.description = cleanupFieldAnswer(trimmedMessage, ["descrição", "descricao", "origem"]);
  }

  if (missingFields.length === 1 && missingFields[0] === "category" && !next.category) {
    next.category = cleanupFieldAnswer(trimmedMessage, ["categoria"]);
  }

  return next;
}

export function parseAmountFromText(message: string) {
  const multiplierMatch = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .match(/(?:r\$\s*)?(\d+(?:[,.]\d+)?)\s*(mil|milhao|milhoes)\b/);

  if (multiplierMatch) {
    const baseValue = Number(multiplierMatch[1].replace(",", "."));
    const multiplier = multiplierMatch[2] === "mil" ? 1_000 : 1_000_000;
    const value = baseValue * multiplier;

    return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
  }

  return extractMoneyAmount(message) ?? parseSpokenNumberPtBr(message);
}

function cleanupFieldAnswer(value: string, prefixes: string[]) {
  const prefixPattern = new RegExp(`^(${prefixes.join("|")})\\s*:?\\s*`, "i");
  return value.replace(prefixPattern, "").trim();
}

function normalizeConfirmationText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function isValidDateInput(value?: string) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}
