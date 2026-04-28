import assert from "node:assert/strict";
import { classifyDeterministically, inferCorrectionFields } from "../lib/agent/classifier";
import { runAgentTurnForContext } from "../lib/agent/orchestrator";
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
  {
    amount: 200,
    descriptions: ["pix"],
    message: "hj entrou duzentao no pix",
    type: "entrada",
  },
  {
    amount: 50,
    descriptions: ["almoço", "almoco"],
    message: "gastei cinquentinha no almoço",
    type: "despesa",
  },
  {
    amount: 1000,
    descriptions: ["cliente"],
    message: "recebi milão de cliente",
    type: "entrada",
  },
  {
    amount: 30,
    descriptions: ["lanche"],
    message: "gastei 30 pila no lanche",
    type: "despesa",
  },
  {
    amount: 2000,
    descriptions: ["cliente"],
    message: "recebi dois mil de cliente",
    type: "entrada",
  },
  {
    amount: 200,
    descriptions: ["cliente"],
    message: "recebi duzentos conto de cliente",
    type: "entrada",
  },
  {
    amount: 150,
    descriptions: ["serviço", "servico"],
    message: "entrou 150 conto de serviço",
    type: "entrada",
  },
  {
    amount: 30,
    descriptions: ["lanche"],
    message: "gastei 30 no lanche",
    type: "despesa",
  },
  {
    amount: 150,
    descriptions: ["cliente"],
    message: "recebi 150 de cliente",
    type: "entrada",
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

const pendingExpenseState = {
  draft: {
    amount: 80,
    category: "Alimentação",
    description: "mercado",
    occurred_on: "2026-04-27",
    type: "despesa" as const,
  },
  expectedResponseKind: "confirm_save" as const,
  missingFields: [],
  pendingAction: "register_expense" as const,
  status: "awaiting_confirmation" as const,
  updatedAt: new Date().toISOString(),
};
const idleState = { status: "idle" as const, updatedAt: new Date().toISOString() };

assert.equal(inferCorrectionFields("na verdade foi entrada, não despesa").type, "entrada");
assert.equal(inferCorrectionFields("não, era 90").amount, 90);
assert.match(inferCorrectionFields("corrige pra ontem").occurred_on ?? "", /^\d{4}-\d{2}-\d{2}$/);
assert.equal(inferCorrectionFields("era cliente, não mercado").description, "cliente");

assert.match(classifyDeterministically("oi", idleState)?.reply ?? "", /Oi/);
assert.match(classifyDeterministically("bom dia", idleState)?.reply ?? "", /Bom dia/);
assert.match(classifyDeterministically("você tá aí?", idleState)?.reply ?? "", /Tô sim/);
assert.equal(classifyDeterministically("me ajuda aqui rapidão", idleState)?.kind, "capabilities");
assert.equal(classifyDeterministically("o que você faz?", idleState)?.kind, "capabilities");
assert.equal(classifyDeterministically("como uso isso?", idleState)?.kind, "capabilities");
assert.match(classifyDeterministically("isso aqui tá confuso", idleState)?.reply ?? "", /Poxa/);
assert.match(classifyDeterministically("não quero preencher nada, só resolve pra mim", idleState)?.reply ?? "", /Fechado/);
assert.match(classifyDeterministically("tô com pressa", idleState)?.reply ?? "", /direta/);
assert.match(classifyDeterministically("faz uma piada", idleState)?.reply ?? "", /planilha/);
assert.match(classifyDeterministically("quem ganhou o jogo ontem?", idleState)?.reply ?? "", /não consigo acompanhar/);
assert.match(classifyDeterministically("qual o sentido da vida?", idleState)?.reply ?? "", /FechouMEI/);
assert.match(classifyDeterministically("como eu escondo faturamento?", idleState)?.reply ?? "", /Não posso/);
assert.match(classifyDeterministically("você substitui contador?", idleState)?.reply ?? "", /Não substituo contador/);
assert.equal(classifyDeterministically("cancela", pendingExpenseState)?.kind, "cancelation");
assert.equal(classifyDeterministically("como tá meu mês?", idleState)?.action, "monthly_summary");
assert.equal(classifyDeterministically("qual meu saldo?", idleState)?.action, "monthly_summary");
assert.equal(classifyDeterministically("tenho obrigação pendente?", idleState)?.action, "obligations_status");
assert.ok(["recent_transactions", "specific_movement_query"].includes(classifyDeterministically("quais meus últimos registros?", idleState)?.action ?? ""));

const interruption = classifyDeterministically("pera, antes disso, como tá meu mês?", pendingExpenseState);
assert.equal(interruption?.kind, "interruption");
assert.equal(interruption?.action, "monthly_summary");

void runConversationChecks()
  .then(() => {
    console.log(`Agent parser fixture passed (${cases.length} parser cases + conversational checks).`);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

async function runConversationChecks() {
  const fakeContext = makeFakeContext();

  const firstExpense = await runAgentTurnForContext({
    context: fakeContext,
    message: "gastei 80 no mercado",
  });

  assert.match(firstExpense.reply, /Anotado: gasto de R\$\s*80,00 com mercado\. Posso salvar\?/);

  const amountCorrection = await runAgentTurnForContext({
    context: fakeContext,
    message: "não, era 90",
    state: firstExpense.state,
  });

  assert.match(amountCorrection.reply, /Corrigido para R\$\s*90,00\. Posso salvar assim\?/);

  const typeCorrection = await runAgentTurnForContext({
    context: fakeContext,
    message: "na verdade foi entrada, não despesa",
    state: firstExpense.state,
  });

  assert.match(typeCorrection.reply, /Boa, corrigi para entrada\. Agora me diz: essa entrada foi de quê\?/);

  const expenseToIncomeStart = await runAgentTurnForContext({
    context: fakeContext,
    message: "gastei 200 BRL com jantar QA Helena",
  });

  const expenseToIncome = await runAgentTurnForContext({
    context: fakeContext,
    message: "na verdade eu recebi 200 BRL no jantar QA Helena",
    state: expenseToIncomeStart.state,
  });

  assert.equal(expenseToIncome.state.pendingAction, "register_income");
  assert.equal(expenseToIncome.state.draft?.type, "entrada");
  assert.equal(expenseToIncome.state.draft?.amount, 200);
  assert.equal(normalizeDescription(expenseToIncome.state.draft?.description ?? ""), "jantar qa helena");
  assertCleanCorrectionDescription(expenseToIncome.state.draft?.description);
  assert.match(expenseToIncome.reply, /Boa, corrigi para entrada de R\$\s*200,00 no jantar QA Helena\. Posso salvar\?/);

  const incomeWrites = await confirmWithCapturedWrites(expenseToIncome.state);
  assert.equal(incomeWrites[0]?.payload.type, "entrada");
  assert.equal(incomeWrites[0]?.payload.amount, 200);
  assert.equal(normalizeDescription(incomeWrites[0]?.payload.description ?? ""), "jantar qa helena");

  const incomeToExpenseStart = await runAgentTurnForContext({
    context: fakeContext,
    message: "recebi 90 BRL de cliente QA Helena",
  });

  const incomeToExpense = await runAgentTurnForContext({
    context: fakeContext,
    message: "na verdade foi despesa de 90 BRL com mercado QA Helena",
    state: incomeToExpenseStart.state,
  });

  assert.equal(incomeToExpense.state.pendingAction, "register_expense");
  assert.equal(incomeToExpense.state.draft?.type, "despesa");
  assert.equal(incomeToExpense.state.draft?.amount, 90);
  assert.equal(normalizeDescription(incomeToExpense.state.draft?.description ?? ""), "mercado qa helena");
  assertCleanCorrectionDescription(incomeToExpense.state.draft?.description);
  assert.match(incomeToExpense.reply, /Entendi, mudei para despesa de R\$\s*90,00 com mercado QA Helena\. Posso salvar\?/);

  const expenseWrites = await confirmWithCapturedWrites(incomeToExpense.state);
  assert.equal(expenseWrites[0]?.payload.type, "despesa");
  assert.equal(expenseWrites[0]?.payload.amount, 90);
  assert.equal(normalizeDescription(expenseWrites[0]?.payload.description ?? ""), "mercado qa helena");

  const interruptionReply = await runAgentTurnForContext({
    context: fakeContext,
    message: "pera, antes disso, como tá meu mês?",
    state: firstExpense.state,
  });

  assert.match(interruptionReply.reply, /entradas/);
  assert.match(interruptionReply.reply, /Sobre aquele gasto de R\$\s*80,00 com mercado, quer que eu salve ou deixo pra depois\?/);

  const dateCorrection = await runAgentTurnForContext({
    context: fakeContext,
    message: "corrige pra ontem",
    state: firstExpense.state,
  });

  assert.match(dateCorrection.reply, /Fechado, coloquei com data de ontem\. Posso salvar assim\?/);

  for (const command of ["coloca pra ontem", "bota pra ontem", "põe pra ontem"]) {
    const result = await runAgentTurnForContext({
      context: fakeContext,
      message: command,
      state: firstExpense.state,
    });

    assert.equal(result.state.draft?.occurred_on, addDaysInput(-1), command);
    assert.match(result.reply, /Fechado, coloquei com data de ontem\. Posso salvar assim\?/, command);
  }

  const tomorrowCorrection = await runAgentTurnForContext({
    context: fakeContext,
    message: "coloca pra amanhã",
    state: firstExpense.state,
  });

  assert.equal(tomorrowCorrection.state.draft?.occurred_on, addDaysInput(1));
  assert.match(tomorrowCorrection.reply, /Fechado, coloquei com data de \d{2}\/\d{2}\/\d{4}\. Posso salvar assim\?/);
}

type FakeWrite = {
  payload: any;
  table: string;
};

async function confirmWithCapturedWrites(state: Awaited<ReturnType<typeof runAgentTurnForContext>>["state"]) {
  const writes: FakeWrite[] = [];
  const originalConsoleError = console.error;

  console.error = () => {};

  try {
    await runAgentTurnForContext({
      context: makeFakeContext(writes),
      message: "sim",
      state,
    });
  } finally {
    console.error = originalConsoleError;
  }

  return writes;
}

function makeFakeContext(writes: FakeWrite[] = []) {
  return {
    supabase: {
      from: (table: string) => makeFakeQuery(
        table === "movimentacoes"
          ? [
              { amount: 200, occurred_on: "2026-04-27", type: "entrada" },
              { amount: 80, occurred_on: "2026-04-27", type: "despesa" },
            ]
          : [],
        table,
        writes,
      ),
      rpc: async () => ({ data: null, error: null }),
    },
    userId: "test-user",
  } as any;
}

function makeFakeQuery(data: unknown[], table: string, writes: FakeWrite[]) {
  let result = { data: data as unknown, error: null };
  const query = {
    eq: () => query,
    gte: () => query,
    insert: (payload: any) => {
      writes.push({ payload, table });
      result = {
        data: Array.isArray(payload)
          ? payload.map((row, index) => ({ id: `fake-id-${index + 1}`, ...row }))
          : { id: "fake-id", ...payload },
        error: null,
      };
      return query;
    },
    lte: () => query,
    limit: () => query,
    maybeSingle: async () => ({ data: Array.isArray(result.data) ? result.data[0] ?? null : result.data, error: null }),
    order: () => query,
    select: () => query,
    single: async () => ({ data: Array.isArray(result.data) ? result.data[0] : result.data, error: null }),
    then: (resolve: (value: typeof result) => void) => resolve(result),
  };

  return query;
}

function assertCleanCorrectionDescription(description?: string) {
  const normalized = normalizeDescription(description ?? "");
  assert.ok(normalized.length > 0, "Expected correction description");
  assert.notEqual(normalized, "verdade");
  assert.notEqual(normalized, "verdade era");
  assert.notEqual(normalized, "despesa");
  assert.notEqual(normalized, "entrada");
  assert.notEqual(normalized, "na verdade");
  assert.doesNotMatch(normalized, /\b(verdade|despesa|entrada|na verdade|corrige|corrigir|mude|troca|troque)\b/);
}

function addDaysInput(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function normalizeDescription(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}
