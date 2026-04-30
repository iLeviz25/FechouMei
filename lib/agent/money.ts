type MoneyCandidate = {
  amount: number;
  hasCurrencyMarker: boolean;
  index: number;
  raw: string;
};

const moneyExpressionPattern =
  /(^|[^\p{L}\p{N}/])((?:(?:r\$|brl)\s*)?[+-]?(?:(?:\d{1,3}(?:[.,]\d{3})+)|\d+)(?:[.,]\d{1,2})?\s*(?:reais|real|brl|conto|contos|pila|pilas)?)(?!\s*\/)/giu;

const standaloneMoneyWordsPattern =
  /(^|[\s([{])(?:r\$|brl|reais|real|conto|contos|pila|pilas)(?=$|[\s)\]},.!?;:])/giu;

const informalMoneyWordsPattern =
  /(^|[\s([{])(?:duzent[aã]o|cemz[aã]o|cinquentinha|quinhent[aã]o|mil[aã]o)(?=$|[\s)\]},.!?;:])/giu;

export function extractMoneyAmount(message: string) {
  const candidates = findMoneyCandidates(message);

  if (candidates.length === 0) {
    return null;
  }

  const markedCandidate = candidates.find((candidate) => candidate.hasCurrencyMarker);

  if (markedCandidate) {
    return markedCandidate.amount;
  }

  return candidates[candidates.length - 1]?.amount ?? null;
}

export function stripMoneyExpressions(message: string) {
  return message
    .replace(moneyExpressionPattern, (_match, leading: string) => `${leading} `)
    .replace(standaloneMoneyWordsPattern, (_match, leading: string) => `${leading} `)
    .replace(informalMoneyWordsPattern, (_match, leading: string) => `${leading} `)
    .replace(/\s+/g, " ")
    .trim();
}

function findMoneyCandidates(message: string): MoneyCandidate[] {
  const candidates: MoneyCandidate[] = [];

  for (const match of message.matchAll(moneyExpressionPattern)) {
    const leading = match[1] ?? "";
    const raw = match[2]?.trim() ?? "";
    const numberText = raw.match(/[+-]?(?:(?:\d{1,3}(?:[.,]\d{3})+)|\d+)(?:[.,]\d{1,2})?/)?.[0];

    if (!numberText) {
      continue;
    }

    const amount = parseMoneyNumber(numberText);

    if (!amount) {
      continue;
    }

    candidates.push({
      amount,
      hasCurrencyMarker: /\b(?:r\$|brl|reais|real|conto|contos|pila|pilas)\b/i.test(raw) || /r\$/i.test(raw),
      index: (match.index ?? 0) + leading.length,
      raw,
    });
  }

  return candidates;
}

function parseMoneyNumber(rawValue: string) {
  const normalized = rawValue.replace(/[+\s]/g, "").replace(/^-/, "");
  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const groupSeparator = decimalSeparator === "," ? "." : ",";
    return toPositiveAmount(
      normalized
        .replace(new RegExp(`\\${groupSeparator}`, "g"), "")
        .replace(decimalSeparator, "."),
    );
  }

  const separator = lastComma >= 0 ? "," : lastDot >= 0 ? "." : null;

  if (!separator) {
    return toPositiveAmount(normalized);
  }

  const separatorIndex = normalized.lastIndexOf(separator);
  const decimalDigits = normalized.slice(separatorIndex + 1);

  if (decimalDigits.length === 3 && separatorIndex <= 3) {
    return toPositiveAmount(normalized.replace(new RegExp(`\\${separator}`, "g"), ""));
  }

  if (decimalDigits.length <= 2) {
    return toPositiveAmount(normalized.replace(separator, "."));
  }

  return toPositiveAmount(normalized.replace(new RegExp(`\\${separator}`, "g"), ""));
}

function toPositiveAmount(value: string) {
  const amount = Number(value);

  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
}
