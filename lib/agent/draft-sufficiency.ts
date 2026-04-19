import type { AgentMovementDraft, MovementField } from "./types";

const weakDescriptionTokens = new Set([
  "a",
  "agora",
  "ai",
  "as",
  "brl",
  "cadastra",
  "cadastrar",
  "coloca",
  "colocar",
  "com",
  "como",
  "da",
  "das",
  "de",
  "despesa",
  "do",
  "dos",
  "em",
  "entrada",
  "essa",
  "esse",
  "isso",
  "lanca",
  "lancar",
  "na",
  "no",
  "o",
  "os",
  "para",
  "pode",
  "por",
  "pra",
  "pro",
  "real",
  "reais",
  "registra",
  "registrar",
  "registre",
  "uma",
  "um",
  "valor",
]);

const dateOnlyTokens = new Set(["hoje", "ontem"]);

export function getReliableMovementMissingFields(draft: AgentMovementDraft): MovementField[] {
  if (!draft.amount || draft.amount <= 0) {
    return ["amount"];
  }

  if (!isUsefulMovementDescription(draft.description)) {
    return ["description"];
  }

  if (!draft.category) {
    return ["category"];
  }

  if (!draft.occurred_on) {
    return ["occurred_on"];
  }

  return [];
}

export function isUsefulMovementDescription(description?: string) {
  if (!description) {
    return false;
  }

  const normalizedTokens = normalizeDescriptionTokens(description);

  if (normalizedTokens.length === 0) {
    return false;
  }

  return normalizedTokens.some((token) => !weakDescriptionTokens.has(token) && !dateOnlyTokens.has(token));
}

export function normalizeDescriptionTokens(description: string) {
  return description
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}
