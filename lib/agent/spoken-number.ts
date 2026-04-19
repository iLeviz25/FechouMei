const units = new Map([
  ["um", 1],
  ["uma", 1],
  ["dois", 2],
  ["duas", 2],
  ["tres", 3],
  ["três", 3],
  ["quatro", 4],
  ["cinco", 5],
  ["seis", 6],
  ["sete", 7],
  ["oito", 8],
  ["nove", 9],
]);

const teens = new Map([
  ["dez", 10],
  ["onze", 11],
  ["doze", 12],
  ["treze", 13],
  ["quatorze", 14],
  ["catorze", 14],
  ["quinze", 15],
  ["dezesseis", 16],
  ["dezessete", 17],
  ["dezoito", 18],
  ["dezenove", 19],
]);

const tens = new Map([
  ["vinte", 20],
  ["trinta", 30],
  ["quarenta", 40],
  ["cinquenta", 50],
  ["sessenta", 60],
  ["setenta", 70],
  ["oitenta", 80],
  ["noventa", 90],
]);

const hundreds = new Map([
  ["cem", 100],
  ["cento", 100],
  ["duzentos", 200],
  ["duzentas", 200],
  ["trezentos", 300],
  ["trezentas", 300],
  ["quatrocentos", 400],
  ["quatrocentas", 400],
  ["quinhentos", 500],
  ["quinhentas", 500],
  ["seiscentos", 600],
  ["seiscentas", 600],
  ["setecentos", 700],
  ["setecentas", 700],
  ["oitocentos", 800],
  ["oitocentas", 800],
  ["novecentos", 900],
  ["novecentas", 900],
]);

const currencyTokens = new Set(["reais", "real", "conto", "contos"]);
const ignoredTokens = new Set(["e", "de", ...currencyTokens]);

export function parseSpokenNumberPtBr(message: string) {
  const normalized = normalizeNumberText(message);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  let best: number | null = null;
  let bestLength = 0;

  for (let start = 0; start < tokens.length; start += 1) {
    for (let end = Math.min(tokens.length, start + 8); end > start; end -= 1) {
      const slice = tokens.slice(start, end);
      const parsed = parseNumberTokens(slice);

      if (parsed && parsed.length > bestLength) {
        best = parsed.value;
        bestLength = parsed.length;
      }
    }
  }

  return best;
}

function parseNumberTokens(tokens: string[]) {
  const meaningful = tokens.filter((token) => !ignoredTokens.has(token));
  const hasCurrencyHint = tokens.some((token) => currencyTokens.has(token));

  if (meaningful.length === 0) {
    return null;
  }

  let total = 0;
  let current = 0;
  let consumed = 0;

  for (const token of meaningful) {
    if (hundreds.has(token)) {
      current += hundreds.get(token)!;
      consumed += 1;
      continue;
    }

    if (tens.has(token)) {
      current += tens.get(token)!;
      consumed += 1;
      continue;
    }

    if (teens.has(token)) {
      current += teens.get(token)!;
      consumed += 1;
      continue;
    }

    if (units.has(token)) {
      current += units.get(token)!;
      consumed += 1;
      continue;
    }

    if (token === "mil") {
      total += (current || 1) * 1000;
      current = 0;
      consumed += 1;
      continue;
    }

    return null;
  }

  const value = total + current;

  if (consumed === 0 || value <= 0) {
    return null;
  }

  if (consumed === 1 && value < 10 && !hasCurrencyHint) {
    return null;
  }

  return {
    length: tokens.length,
    value,
  };
}

function normalizeNumberText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}
