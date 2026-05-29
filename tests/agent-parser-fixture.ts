import assert from "node:assert/strict";
import { classifyDeterministically, inferCorrectionFields } from "../lib/agent/classifier";
import { getAgentCapabilitiesReply } from "../lib/agent/capabilities";
import { runAgentTurnForContext } from "../lib/agent/orchestrator";
import { buildQuickPeriodReply, resolveQuickPeriodRange } from "../lib/agent/period-queries";
import { parseTransactionMessage, parseTransactionMessages } from "../lib/agent/transaction-parser";
import { normalizeEvolutionWebhookPayload } from "../lib/channels/whatsapp/evolution";
import type { MovementField, MovementType } from "../lib/agent/types";

type ParserCase = {
  amount?: number;
  category?: string;
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
    amount: 33.39,
    category: "alimentacao",
    descriptions: ["lanche"],
    message: "gastei 33,39 com lanche",
    type: "despesa",
  },
  {
    amount: 33.39,
    category: "alimentacao",
    descriptions: ["comida"],
    message: "gastei 33,39 com comida",
    type: "despesa",
  },
  {
    amount: 33.39,
    category: "alimentacao",
    descriptions: ["lanche"],
    message: "Eu acabei de gastar 33 e 39 com um lanche.",
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

  if (parserCase.category) {
    assert.equal(
      normalizeDescription(parsed.draft.category ?? ""),
      normalizeDescription(parserCase.category),
      parserCase.message,
    );
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

for (const message of [
  "gastei 33,39 com lanche",
  "gastei 33,39 com comida",
  "Eu acabei de gastar 33 e 39 com um lanche.",
]) {
  const parsedMessages = parseTransactionMessages(message);

  assert.equal(parsedMessages.length, 1, `Expected a single movement for: ${message}`);
  assert.equal(parsedMessages[0]?.draft.amount, 33.39, message);
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
assert.match(getAgentCapabilitiesReply(idleState), /Eu posso te ajudar a cuidar do seu MEI/);
assert.match(getAgentCapabilitiesReply(idleState), /registrar entradas e despesas/);
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

const dailyReport = classifyDeterministically("relatorio diario", idleState);
assert.equal(dailyReport?.action, "quick_period_query");
assert.equal(dailyReport?.periodQuery?.type, "period");
if (dailyReport?.periodQuery?.type !== "period") {
  throw new Error("Expected daily report period query.");
}
assert.equal(dailyReport.periodQuery.range, "today");
assert.equal(dailyReport.periodQuery.format, "report");

const weeklyReport = classifyDeterministically("relatorio semanal", idleState);
assert.equal(weeklyReport?.action, "quick_period_query");
assert.equal(weeklyReport?.periodQuery?.type, "period");
if (weeklyReport?.periodQuery?.type !== "period") {
  throw new Error("Expected weekly report period query.");
}
assert.equal(weeklyReport.periodQuery.range, "this_week");
assert.equal(weeklyReport.periodQuery.format, "report");

const monthlyReport = classifyDeterministically("relatorio mensal", idleState);
assert.equal(monthlyReport?.action, "quick_period_query");
assert.equal(monthlyReport?.periodQuery?.type, "period");
if (monthlyReport?.periodQuery?.type !== "period") {
  throw new Error("Expected monthly report period query.");
}
assert.equal(monthlyReport.periodQuery.range, "this_month");
assert.equal(monthlyReport.periodQuery.format, "report");

const naturalMonthlyReport = classifyDeterministically("manda relatorio desse mes", idleState);
assert.equal(naturalMonthlyReport?.action, "quick_period_query");
assert.equal(naturalMonthlyReport?.periodQuery?.type, "period");
if (naturalMonthlyReport?.periodQuery?.type !== "period") {
  throw new Error("Expected natural monthly report period query.");
}
assert.equal(naturalMonthlyReport.periodQuery.range, "this_month");
assert.equal(naturalMonthlyReport.periodQuery.format, "report");

const saoPauloReferenceNow = new Date("2026-05-28T15:00:00Z");

const explicitAprilReport = classifyDeterministically("relatorio do mes de abril", idleState);
assert.equal(explicitAprilReport?.action, "quick_period_query");
assert.equal(explicitAprilReport?.periodQuery?.type, "period");
if (explicitAprilReport?.periodQuery?.type !== "period") {
  throw new Error("Expected explicit April report period query.");
}
assert.equal(explicitAprilReport.periodQuery.range, "explicit_month");
assert.equal(explicitAprilReport.periodQuery.month, 4);
assert.equal(explicitAprilReport.periodQuery.format, "report");
assert.deepEqual(resolveQuickPeriodRange(explicitAprilReport.periodQuery, saoPauloReferenceNow), {
  end: "2026-04-30",
  label: "em abril de 2026",
  prefix: "Em abril de 2026",
  start: "2026-04-01",
});

const explicitApril2026Report = classifyDeterministically("relatorio de abril de 2026", idleState);
assert.equal(explicitApril2026Report?.action, "quick_period_query");
assert.equal(explicitApril2026Report?.periodQuery?.type, "period");
if (explicitApril2026Report?.periodQuery?.type !== "period") {
  throw new Error("Expected explicit April 2026 report period query.");
}
assert.equal(explicitApril2026Report.periodQuery.range, "explicit_month");
assert.equal(explicitApril2026Report.periodQuery.month, 4);
assert.equal(explicitApril2026Report.periodQuery.year, 2026);
assert.equal(explicitApril2026Report.periodQuery.format, "report");

const thisMonthReport = classifyDeterministically("relatorio desse mes", idleState);
assert.equal(thisMonthReport?.action, "quick_period_query");
assert.equal(thisMonthReport?.periodQuery?.type, "period");
if (thisMonthReport?.periodQuery?.type !== "period") {
  throw new Error("Expected this month report period query.");
}
assert.equal(thisMonthReport.periodQuery.range, "this_month");
assert.deepEqual(resolveQuickPeriodRange(thisMonthReport.periodQuery, saoPauloReferenceNow), {
  end: "2026-05-31",
  label: "em maio de 2026",
  prefix: "Em maio de 2026",
  start: "2026-05-01",
});

const lastMonthReport = classifyDeterministically("relatorio do mes passado", idleState);
assert.equal(lastMonthReport?.action, "quick_period_query");
assert.equal(lastMonthReport?.periodQuery?.type, "period");
if (lastMonthReport?.periodQuery?.type !== "period") {
  throw new Error("Expected last month report period query.");
}
assert.equal(lastMonthReport.periodQuery.range, "last_month");
assert.deepEqual(resolveQuickPeriodRange(lastMonthReport.periodQuery, saoPauloReferenceNow), {
  end: "2026-04-30",
  label: "em abril de 2026",
  prefix: "Em abril de 2026",
  start: "2026-04-01",
});

const requestedMonthlyReport = classifyDeterministically("me faca um relatorio mensal", idleState);
assert.equal(requestedMonthlyReport?.action, "quick_period_query");
assert.equal(requestedMonthlyReport?.periodQuery?.type, "period");
if (requestedMonthlyReport?.periodQuery?.type !== "period") {
  throw new Error("Expected requested monthly report period query.");
}
assert.equal(requestedMonthlyReport.periodQuery.range, "this_month");
assert.equal(requestedMonthlyReport.periodQuery.format, "report");

for (const message of [
  "Me faça um relatório do mês de abril",
  "Me faça um relatório de abril",
  "Relatório do mês de abril",
  "Quero meu relatório de abril",
  "Meu relatório de abril",
]) {
  const report = classifyDeterministically(message, idleState);
  assert.equal(report?.action, "quick_period_query", message);
  assert.equal(report?.periodQuery?.type, "period", message);
  if (report?.periodQuery?.type !== "period") {
    throw new Error(`Expected explicit April report period query for: ${message}`);
  }
  assert.equal(report.periodQuery.range, "explicit_month", message);
  assert.equal(report.periodQuery.month, 4, message);
  assert.equal(report.periodQuery.format, "report", message);
  assert.deepEqual(resolveQuickPeriodRange(report.periodQuery, saoPauloReferenceNow), {
    end: "2026-04-30",
    label: "em abril de 2026",
    prefix: "Em abril de 2026",
    start: "2026-04-01",
  }, message);
}

const aprilProfit = classifyDeterministically("Quanto lucrei em abril?", idleState);
assert.equal(aprilProfit?.action, "quick_period_query");
assert.equal(aprilProfit?.periodQuery?.type, "period");
if (aprilProfit?.periodQuery?.type !== "period") {
  throw new Error("Expected April profit period query.");
}
assert.equal(aprilProfit.periodQuery.range, "explicit_month");
assert.equal(aprilProfit.periodQuery.month, 4);
assert.equal(aprilProfit.periodQuery.metric, "balance");
assert.deepEqual(resolveQuickPeriodRange(aprilProfit.periodQuery, saoPauloReferenceNow), {
  end: "2026-04-30",
  label: "em abril de 2026",
  prefix: "Em abril de 2026",
  start: "2026-04-01",
});

const reportReply = buildQuickPeriodReply(
  { format: "report", metric: "summary", range: "today", type: "period" },
  { end: "2026-05-27", label: "hoje", prefix: "Hoje", start: "2026-05-27" },
  [
    { amount: 500, category: "Cliente", description: "cliente Ana", occurred_on: "2026-05-27", type: "entrada" },
    { amount: 120, category: "Internet", description: "internet", occurred_on: "2026-05-27", type: "despesa" },
  ],
);
assert.match(reportReply, /📊 Relatório hoje/);
assert.match(reportReply, /Período: 27\/05\/2026/);
assert.match(reportReply, /✅ Entradas: R\$\s*500,00 \(1\)/);
assert.match(reportReply, /🔻 Despesas: R\$\s*120,00 \(1\)/);
assert.match(reportReply, /💰 Resultado: R\$\s*380,00/);
assert.match(reportReply, /Movimentações registradas: 2/);
assert.match(reportReply, /Maior entrada: R\$\s*500,00 — Cliente Ana/);
assert.match(reportReply, /Maior despesa: R\$\s*120,00 — Internet/);

const prettyExplicitMonthReportReply = buildQuickPeriodReply(
  { format: "report", metric: "summary", month: 4, range: "explicit_month", type: "period", year: 2026 },
  { end: "2026-04-30", label: "em abril de 2026", prefix: "Em abril de 2026", start: "2026-04-01" },
  [
    { amount: 5000, category: "AJUSTE", description: "SALDO INICIAL", occurred_on: "2026-04-01", type: "entrada" },
    { amount: 1000, category: "CLIENTES", description: "CLIENTE ANA", occurred_on: "2026-04-10", type: "entrada" },
    { amount: 2200, category: "ALUGUEL", description: "TRANSFERENCIA ENVIADA PRESTADOR", occurred_on: "2026-04-17", type: "despesa" },
    { amount: 1400, category: "ALUGUEL", description: "ALUGUEL SALA COMERCIAL", occurred_on: "2026-04-22", type: "despesa" },
  ],
);
assert.match(prettyExplicitMonthReportReply, /📊 Relatório de abril de 2026/);
assert.match(prettyExplicitMonthReportReply, /Período: 01\/04\/2026 a 30\/04\/2026/);
assert.match(prettyExplicitMonthReportReply, /Maior entrada: R\$\s*5\.000,00 — Saldo inicial/);
assert.match(prettyExplicitMonthReportReply, /Maior despesa: R\$\s*2\.200,00 — Transferência enviada prestador/);
assert.match(prettyExplicitMonthReportReply, /Categoria com mais despesas: Aluguel \(R\$\s*3\.600,00\)/);
assert.match(prettyExplicitMonthReportReply, /Resumo: abril fechou positivo em R\$\s*2\.400,00\./);

const emptyExplicitMonthReportReply = buildQuickPeriodReply(
  { format: "report", metric: "summary", month: 4, range: "explicit_month", type: "period", year: 2026 },
  { end: "2026-04-30", label: "em abril de 2026", prefix: "Em abril de 2026", start: "2026-04-01" },
  [],
);
assert.match(emptyExplicitMonthReportReply, /📊 Relatório de abril de 2026/);
assert.match(emptyExplicitMonthReportReply, /Não encontrei movimentações em abril de 2026/);

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
  const reportYear = getCurrentSaoPauloYearForTest();

  for (const message of [
    "Me faça um relatório do mês de abril",
    "Me faça um relatório de abril",
    "Relatório do mês de abril",
    "Quero meu relatório de abril",
    "Meu relatório de abril",
  ]) {
    const result = await runWhatsAppTextTurn(fakeContext, message);

    assert.match(result.reply, new RegExp(`Relatório de abril de ${reportYear}`), message);
    assert.match(result.reply, new RegExp(`Período: 01/04/${reportYear} a 30/04/${reportYear}`), message);
    assert.doesNotMatch(result.reply, new RegExp(`Relatório de maio de ${reportYear}`), message);
  }

  const profitResult = await runWhatsAppTextTurn(fakeContext, "Quanto lucrei em abril?");
  assert.match(profitResult.reply, new RegExp(`Em abril de ${reportYear}`));
  assert.doesNotMatch(profitResult.reply, new RegExp(`Em maio de ${reportYear}`));

  const firstExpense = await runAgentTurnForContext({
    context: fakeContext,
    message: "gastei 80 no mercado",
  });

  assert.match(firstExpense.reply, /Entendi: despesa de R\$\s*80,00 com Mercado\.\nPosso salvar\?/);

  const decimalSnackExpense = await runAgentTurnForContext({
    channel: "whatsapp",
    context: fakeContext,
    message: "gastei 33,39 com lanche",
  });

  assert.equal(decimalSnackExpense.state.pendingAction, "register_expense");
  assert.equal(decimalSnackExpense.state.draft?.amount, 33.39);
  assert.equal(normalizeDescription(decimalSnackExpense.state.draft?.description ?? ""), "lanche");
  assert.equal(normalizeDescription(decimalSnackExpense.state.draft?.category ?? ""), "alimentacao");
  assert.match(decimalSnackExpense.reply, /Entendi: despesa de R\$\s*33,39 com Lanche\.\nPosso salvar\?/);

  const decimalFoodExpense = await runAgentTurnForContext({
    channel: "whatsapp",
    context: fakeContext,
    message: "gastei 33,39 com comida",
  });

  assert.equal(decimalFoodExpense.state.pendingAction, "register_expense");
  assert.equal(decimalFoodExpense.state.draft?.amount, 33.39);
  assert.equal(normalizeDescription(decimalFoodExpense.state.draft?.description ?? ""), "comida");
  assert.equal(normalizeDescription(decimalFoodExpense.state.draft?.category ?? ""), "alimentacao");
  assert.match(decimalFoodExpense.reply, /Entendi: despesa de R\$\s*33,39 com Comida\.\nPosso salvar\?/);

  const cancelPendingExpense = await runAgentTurnForContext({
    channel: "whatsapp",
    context: fakeContext,
    message: "cancelar",
    state: decimalFoodExpense.state,
  });

  assert.equal(cancelPendingExpense.state.status, "idle");
  assert.match(cancelPendingExpense.reply, /cancelei o rascunho que estava pendente/);

  const cancelPendingBatch = await runAgentTurnForContext({
    channel: "whatsapp",
    context: fakeContext,
    message: "cancela",
    state: {
      expectedResponseKind: "missing_category",
      missingFields: ["category"],
      movementBatch: [
        {
          amount: 33,
          description: "rascunho antigo",
          occurred_on: "2026-04-29",
          type: "despesa",
        },
      ],
      pendingAction: "register_movements_batch",
      status: "collecting",
      updatedAt: new Date().toISOString(),
    },
  });

  assert.equal(cancelPendingBatch.state.status, "idle");
  assert.match(cancelPendingBatch.reply, /cancelei o rascunho que estava pendente/);

  const transcribedDecimalExpense = await runAgentTurnForContext({
    channel: "whatsapp",
    context: fakeContext,
    message: "Eu acabei de gastar 33 e 39 com um lanche.",
  });

  assert.equal(transcribedDecimalExpense.state.pendingAction, "register_expense");
  assert.equal(transcribedDecimalExpense.state.draft?.amount, 33.39);
  assert.equal(normalizeDescription(transcribedDecimalExpense.state.draft?.description ?? ""), "lanche");
  assert.equal(normalizeDescription(transcribedDecimalExpense.state.draft?.category ?? ""), "alimentacao");
  assert.match(transcribedDecimalExpense.reply, /Entendi: despesa de R\$\s*33,39 com Lanche\.\nPosso salvar\?/);

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
  assert.match(expenseToIncome.reply, /Boa, corrigi para entrada de R\$\s*200,00 no Jantar QA Helena\. Posso salvar\?/);

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
  assert.match(incomeToExpense.reply, /Entendi, mudei para despesa de R\$\s*90,00 com Mercado QA Helena\. Posso salvar\?/);

  const expenseWrites = await confirmWithCapturedWrites(incomeToExpense.state);
  assert.equal(expenseWrites[0]?.payload.type, "despesa");
  assert.equal(expenseWrites[0]?.payload.amount, 90);
  assert.equal(normalizeDescription(expenseWrites[0]?.payload.description ?? ""), "mercado qa helena");

  const interruptionReply = await runAgentTurnForContext({
    context: fakeContext,
    message: "pera, antes disso, como tá meu mês?",
    state: firstExpense.state,
  });

  assert.match(interruptionReply.reply, /Entradas/);
  assert.match(interruptionReply.reply, /Sobre aquele gasto de R\$\s*80,00 com Mercado, quer que eu salve ou deixo pra depois\?/);

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

async function runWhatsAppTextTurn(context: ReturnType<typeof makeFakeContext>, message: string) {
  const normalized = normalizeEvolutionWebhookPayload({
    data: {
      key: {
        fromMe: false,
        id: `test-${Date.now()}`,
        remoteJid: "5511999999999@s.whatsapp.net",
      },
      message: {
        conversation: message,
      },
      messageType: "conversation",
    },
    event: "messages.upsert",
    instance: "fechoumei-test",
  });

  assert.equal(normalized.text, message);

  return runAgentTurnForContext({
    channel: "whatsapp",
    context,
    message: normalized.text ?? "",
  });
}

function getCurrentSaoPauloYearForTest() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
  }).formatToParts(new Date());

  return Number(parts.find((part) => part.type === "year")?.value ?? new Date().getFullYear());
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
