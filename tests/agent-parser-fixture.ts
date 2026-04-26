import assert from "node:assert/strict";
import { parseTransactionMessage } from "../lib/agent/transaction-parser";
import type { MovementField, MovementType } from "../lib/agent/types";

type ParserCase = {
  amount?: number;
  descriptions?: string[];
  message: string;
  missingFields?: MovementField[];
  type: MovementType;
};

const cases: ParserCase[] = [
  {
    amount: 50,
    descriptions: ["hamburguer"],
    message: "paguei 50 reais de hambúrguer",
    type: "despesa",
  },
  {
    amount: 34.9,
    descriptions: ["canva pro"],
    message: "comprei R$ 34,90 de canva pro",
    type: "despesa",
  },
  {
    amount: 120,
    descriptions: ["internet"],
    message: "gastei 120 com internet",
    type: "despesa",
  },
  {
    amount: 319.55,
    descriptions: ["Meta Ads"],
    message: "paguei 319,55 em Meta Ads",
    type: "despesa",
  },
  {
    amount: 27.5,
    descriptions: ["Uber"],
    message: "lance uma despesa de 27,50 com Uber",
    type: "despesa",
  },
  {
    amount: 800,
    descriptions: ["cliente João", "João"],
    message: "recebi 800 reais do cliente João",
    type: "entrada",
  },
  {
    amount: 1250,
    descriptions: ["Ana Souza"],
    message: "entrou R$ 1.250,00 da Ana Souza",
    type: "entrada",
  },
  {
    amount: 180,
    descriptions: ["venda balcão dinheiro"],
    message: "venda balcão dinheiro 180 reais",
    type: "entrada",
  },
  {
    descriptions: ["hambúrguer", "hamburguer"],
    message: "paguei hambúrguer",
    missingFields: ["amount"],
    type: "despesa",
  },
  {
    amount: 500,
    message: "recebi 500",
    missingFields: ["description"],
    type: "entrada",
  },
  {
    amount: 50,
    descriptions: ["hambúrguer", "hamburguer"],
    message: "comprei hambúrguer por 50 BRL",
    type: "despesa",
  },
  {
    amount: 342.78,
    descriptions: ["mercado atacado"],
    message: "compra mercado atacado 342,78",
    type: "despesa",
  },
  {
    amount: 19.9,
    descriptions: ["taxa banco manutenção"],
    message: "taxa banco manutenção 19,90",
    type: "despesa",
  },
];

for (const parserCase of cases) {
  const parsed = parseTransactionMessage(parserCase.message);

  assert.ok(parsed, `Expected parser result for: ${parserCase.message}`);
  assert.equal(parsed.draft.type, parserCase.type, parserCase.message);

  if (parserCase.amount !== undefined) {
    assert.equal(parsed.draft.amount, parserCase.amount, parserCase.message);
  }

  if (parserCase.descriptions) {
    assert.ok(
      parserCase.descriptions.some((description) =>
        normalizeDescription(description) === normalizeDescription(parsed.draft.description ?? ""),
      ),
      `Unexpected description for "${parserCase.message}": ${parsed.draft.description}`,
    );
  }

  if (parserCase.missingFields) {
    for (const field of parserCase.missingFields) {
      assert.ok(parsed.missingFields.includes(field), `Expected missing field ${field} for: ${parserCase.message}`);
    }
  } else {
    assert.deepEqual(parsed.missingFields, [], `Unexpected missing fields for: ${parserCase.message}`);
  }
}

console.log(`Agent parser fixture passed (${cases.length} cases).`);

function normalizeDescription(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}
