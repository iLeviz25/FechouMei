import assert from "node:assert/strict";
import { classifyDeterministically, inferCorrectionFields } from "../lib/agent/classifier";
import { getAgentCapabilitiesReply } from "../lib/agent/capabilities";
import { runAgentTurnForContext } from "../lib/agent/orchestrator";
import { buildQuickPeriodReply, resolveQuickPeriodRange } from "../lib/agent/period-queries";
import { loadAgentConversationSnapshot } from "../lib/agent/persistence";
import { getHelenaProductQuestionReply } from "../lib/agent/replies";
import { parseTransactionMessage, parseTransactionMessages } from "../lib/agent/transaction-parser";
import { getAgentV2WhatsAppRouteDecision, shouldUseAgentV2ForWhatsApp } from "../lib/agent-v2/feature-flags";
import { runAgentV2TurnForContext } from "../lib/agent-v2/orchestrator";
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

assert.match(getHelenaProductQuestionReply("não entendi o fechamento mensal") ?? "", /fechamento mensal/);
assert.match(getHelenaProductQuestionReply("me explica o fechamento mensal") ?? "", /resultado/);
assert.match(getHelenaProductQuestionReply("o que é fechamento mensal?") ?? "", /encerrar o mês/);
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

  await runAgentV2Checks();

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

  const transcribedIncome = await runAgentTurnForContext({
    channel: "whatsapp",
    context: fakeContext,
    message: "entrou 300 pix cliente joão",
  });

  assert.equal(transcribedIncome.state.pendingAction, "register_income");
  assert.equal(transcribedIncome.state.draft?.amount, 300);
  assert.match(normalizeDescription(transcribedIncome.state.draft?.description ?? ""), /(pix|joao)/);
  assert.match(transcribedIncome.reply, /Entendi: entrada de R\$\s*300,00/);

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

  const incomeToSave = await runAgentTurnForContext({
    channel: "whatsapp",
    context: fakeContext,
    message: "entrou 300 pix cliente joão",
  });

  const savedIncomeState = {
    lastWrite: {
      action: "register_income" as const,
      target: {
        amount: incomeToSave.state.draft?.amount ?? 300,
        category: incomeToSave.state.draft?.category ?? "Venda",
        description: incomeToSave.state.draft?.description ?? "pix cliente joão",
        id: "fake-income-id",
        occurred_on: incomeToSave.state.draft?.occurred_on ?? "2026-05-27",
        type: "entrada" as const,
      },
      targetKind: "latest_income" as const,
      updatedAt: new Date().toISOString(),
    },
    lastWrites: [] as any[],
    status: "idle" as const,
    updatedAt: new Date().toISOString(),
  };
  savedIncomeState.lastWrites = [savedIncomeState.lastWrite];

  const closingQuestionAfterSave = await runAgentTurnForContext({
    channel: "whatsapp",
    context: fakeContext,
    message: "não entendi o fechamento mensal",
    state: savedIncomeState,
  });

  assert.match(closingQuestionAfterSave.reply, /fechamento mensal/);
  assert.match(closingQuestionAfterSave.reply, /quanto entrou, quanto saiu/);
  assert.doesNotMatch(closingQuestionAfterSave.reply, /troquei a descrição/i);
  assert.equal(closingQuestionAfterSave.state.lastWrite?.target.description, savedIncomeState.lastWrite.target.description);

  for (const message of [
    "me explica o fechamento mensal",
    "o que é fechamento mensal?",
    "não entendi o relatório",
    "não entendi como ver meu lucro",
  ]) {
    const explanation = await runAgentTurnForContext({
      channel: "whatsapp",
      context: fakeContext,
      message,
      state: savedIncomeState,
    });

    assert.doesNotMatch(explanation.reply, /troquei a descrição/i, message);
    assert.doesNotMatch(explanation.reply, /atualizei/i, message);
  }

  for (const message of ["me explica o fechamento mensal", "o que é fechamento mensal?"]) {
    const explanation = await runAgentTurnForContext({
      channel: "whatsapp",
      context: fakeContext,
      message,
      state: savedIncomeState,
    });

    assert.match(explanation.reply, /fechamento mensal/, message);
    assert.doesNotMatch(explanation.reply, /troquei a descrição/i, message);
  }

  const editWrites: FakeWrite[] = [];
  const originalConsoleError = console.error;
  console.error = () => {};

  let editConfirmation: Awaited<ReturnType<typeof runAgentTurnForContext>>;

  try {
    editConfirmation = await runAgentTurnForContext({
      channel: "whatsapp",
      context: makeFakeContext(editWrites),
      message: "muda a descrição da última entrada para pix cliente joão",
      state: savedIncomeState,
    });

    assert.equal(editConfirmation.state.pendingAction, "edit_transaction");
    assert.equal(editConfirmation.state.status, "awaiting_confirmation");
    assert.match(editConfirmation.reply, /Posso salvar essa alteração\?/);
    assert.equal(editWrites.length, 0);

    await runAgentTurnForContext({
      channel: "whatsapp",
      context: makeFakeContext(editWrites),
      message: "sim",
      state: editConfirmation.state,
    });
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(normalizeDescription(editWrites.at(-1)?.payload.description ?? ""), "pix cliente joao");
}

async function runAgentV2Checks() {
  const originalEnabled = process.env.HELENA_V2_ENABLED;
  const originalAllowAll = process.env.HELENA_V2_ALLOW_ALL;
  const originalUserIds = process.env.HELENA_V2_USER_IDS;
  const originalNumbers = process.env.HELENA_V2_WHATSAPP_NUMBERS;
  const originalForceV1 = process.env.HELENA_FORCE_V1;
  const originalUseV1Fallback = process.env.HELENA_USE_V1_FALLBACK;
  const originalGeminiEnabled = process.env.HELENA_V2_GEMINI_ENABLED;

  try {
    process.env.HELENA_V2_ENABLED = "";
    process.env.HELENA_V2_ALLOW_ALL = "";
    process.env.HELENA_V2_USER_IDS = "test-user";
    process.env.HELENA_V2_WHATSAPP_NUMBERS = "5511999999999";
    process.env.HELENA_FORCE_V1 = "";
    process.env.HELENA_USE_V1_FALLBACK = "";

    assert.equal(shouldUseAgentV2ForWhatsApp({ remoteNumber: "5511999999999", userId: "test-user" }), true);
    assert.equal(shouldUseAgentV2ForWhatsApp({ remoteNumber: "5511888888888", userId: "other-user" }), true);
    assert.deepEqual(
      getAgentV2WhatsAppRouteDecision({
        message: "oi",
        remoteNumber: "5511999999999",
        source: "text",
        state: idleState,
        userId: "test-user",
      }),
      { enabled: true, reason: "enabled" },
    );

    process.env.HELENA_FORCE_V1 = "true";
    assert.equal(shouldUseAgentV2ForWhatsApp({ remoteNumber: "5511999999999", userId: "test-user" }), false);
    assert.deepEqual(
      getAgentV2WhatsAppRouteDecision({
        message: "oi",
        remoteNumber: "5511999999999",
        source: "text",
        state: idleState,
        userId: "test-user",
      }),
      { enabled: false, reason: "forced_v1_fallback" },
    );
    process.env.HELENA_FORCE_V1 = "";

    assert.deepEqual(
      getAgentV2WhatsAppRouteDecision({
        message: "oi",
        remoteNumber: "5511999999999",
        source: "text",
        state: idleState,
        userId: "test-user",
      }),
      { enabled: true, reason: "enabled" },
    );
    assert.deepEqual(
      getAgentV2WhatsAppRouteDecision({
        message: "oi",
        remoteNumber: "5511999999999",
        source: "audio_transcript",
        state: idleState,
        userId: "test-user",
      }),
      { enabled: true, reason: "enabled" },
    );
    assert.deepEqual(
      getAgentV2WhatsAppRouteDecision({
        message: "sim",
        remoteNumber: "5511999999999",
        source: "text",
        state: pendingExpenseState,
        userId: "test-user",
      }),
      { enabled: true, reason: "enabled" },
    );
    assert.deepEqual(
      getAgentV2WhatsAppRouteDecision({
        message: "entrou 300 pix cliente joão",
        remoteNumber: "5511888888888",
        source: "text",
        state: idleState,
        userId: "other-user",
      }),
      { enabled: true, reason: "enabled" },
    );
    assert.deepEqual(
      getAgentV2WhatsAppRouteDecision({
        message: "me faça um relatório de abril",
        remoteNumber: "5511999999999",
        source: "text",
        state: idleState,
        userId: "test-user",
      }),
      { enabled: true, reason: "enabled" },
    );

    process.env.HELENA_V2_GEMINI_ENABLED = "false";

    const greeting = await runAgentV2TurnForContext({
      context: makeFakeContext(),
      message: "oi",
      state: idleState,
    });
    assert.match(greeting.reply, /Helena/);
    assert.match(greeting.reply, /FechouMEI/);

    const capabilities = await runAgentV2TurnForContext({
      context: makeFakeContext(),
      message: "o que você faz?",
      state: idleState,
    });
    assert.match(capabilities.reply, /versão de teste/);
    assert.match(capabilities.reply, /entradas, despesas, lucro, relatórios/);

    const closing = await runAgentV2TurnForContext({
      context: makeFakeContext(),
      message: "não entendi o fechamento mensal",
      state: idleState,
    });
    assert.match(closing.reply, /fechamento mensal/);
    assert.match(closing.reply, /quanto entrou/);

    const profit = await runAgentV2TurnForContext({
      context: makeFakeContext(),
      message: "como vejo meu lucro?",
      state: idleState,
    });
    assert.match(profit.reply, /entradas e despesas/);
    assert.doesNotMatch(profit.reply, /R\$/);

    const registerIncomeHelp = await runAgentV2TurnForContext({
      context: makeFakeContext(),
      message: "como eu registro uma entrada?",
      state: idleState,
    });
    assert.match(registerIncomeHelp.reply, /valor/);
    assert.match(registerIncomeHelp.reply, /salvo direto|pergunto antes/);

    const outOfScope = await runAgentV2TurnForContext({
      context: makeFakeContext(),
      message: "quem ganhou o jogo ontem?",
      state: idleState,
    });
    assert.match(outOfScope.reply, /foge/);
    assert.match(outOfScope.reply, /FechouMEI/);

    const reportYear = getCurrentSaoPauloYearForTest();
    const currentMonthRange = resolveQuickPeriodRange(
      { format: "report", metric: "summary", range: "this_month", type: "period" },
      new Date(),
    );
    const lastMonthRange = resolveQuickPeriodRange(
      { format: "report", metric: "summary", range: "last_month", type: "period" },
      new Date(),
    );
    const currentMonthName = getMonthNameFromRangeLabel(currentMonthRange.label);
    const lastMonthTitle = getMonthTitleFromRangeLabel(lastMonthRange.label);
    const expectedLastMonthResult = lastMonthRange.start === "2026-04-01" ? 120 : 210;
    const v2ReportMessages = [
      "relatório de abril",
      "me faça um relatório do mês de abril",
    ];

    for (const message of v2ReportMessages) {
      const report = await runAgentV2TurnForContext({
        context: makeFakeContext(),
        message,
        state: idleState,
      });

      assert.match(report.reply, new RegExp(`Relatório de abril de ${reportYear}`), message);
      assert.match(report.reply, new RegExp(`Período: 01/04/${reportYear} a 30/04/${reportYear}`), message);
      assert.match(report.reply, /Entradas: R\$\s*200,00/);
      assert.match(report.reply, /Despesas: R\$\s*80,00/);
    }

    const lastMonthReport = await runAgentV2TurnForContext({
      context: makeFakeContext(),
      message: "relatório do mês passado",
      state: idleState,
    });
    assert.match(lastMonthReport.reply, new RegExp(`Relatório de ${escapeRegExp(lastMonthTitle)}`));
    assert.match(lastMonthReport.reply, new RegExp(`Período: ${formatDateForRegex(lastMonthRange.start)} a ${formatDateForRegex(lastMonthRange.end)}`));

    const lastMonthProfit = await runAgentV2TurnForContext({
      context: makeFakeContext(),
      message: "quanto lucrei mês passado?",
      state: idleState,
    });
    assert.match(lastMonthProfit.reply, new RegExp(escapeRegExp(lastMonthRange.prefix)));
    assert.match(lastMonthProfit.reply, new RegExp(`resultado ficou em R\\$\\s*${formatCurrencyNumberForRegex(expectedLastMonthResult)}`));

    const aprilBalance = await runAgentV2TurnForContext({
      context: makeFakeContext(),
      message: "quanto sobrou em abril?",
      state: idleState,
    });
    assert.match(aprilBalance.reply, new RegExp(`Em abril de ${reportYear}`));
    assert.match(aprilBalance.reply, /resultado ficou em R\$\s*120,00/);

    const currentMonthIncome = await runAgentV2TurnForContext({
      context: makeFakeContext(),
      message: "quanto entrou esse mês?",
      state: idleState,
    });
    assert.match(currentMonthIncome.reply, /entraram R\$\s*500,00/);

    const currentMonthExpense = await runAgentV2TurnForContext({
      context: makeFakeContext(),
      message: "quanto saiu esse mês?",
      state: idleState,
    });
    assert.match(currentMonthExpense.reply, /saíram R\$\s*100,00/);

    const latestMovements = await runAgentV2TurnForContext({
      context: makeFakeContext(),
      message: "quais foram minhas últimas movimentações?",
      state: idleState,
    });
    assert.match(latestMovements.reply, /Encontrei estas movimentações/);
    assert.match(latestMovements.reply, new RegExp(`cliente ${escapeRegExp(currentMonthName)}`, "i"));

    const latestExpenses = await runAgentV2TurnForContext({
      context: makeFakeContext(),
      message: "mostra minhas últimas despesas",
      state: idleState,
    });
    assert.match(latestExpenses.reply, /Encontrei estas despesas/);
    assert.match(latestExpenses.reply, new RegExp(`internet ${escapeRegExp(currentMonthName)}`, "i"));
    assert.doesNotMatch(latestExpenses.reply, new RegExp(`cliente ${escapeRegExp(currentMonthName)}`, "i"));

    const emptyReport = await runAgentV2TurnForContext({
      context: makeFakeContext([], []),
      message: "relatório de abril",
      state: idleState,
    });
    assert.match(emptyReport.reply, new RegExp(`Não encontrei movimentações em abril de ${reportYear}`));

    const obligations = await runAgentV2TurnForContext({
      context: makeFakeContext(),
      message: "tenho alguma obrigação pendente?",
      state: idleState,
    });
    assert.match(obligations.reply, /Pendências principais deste mês|obrigações do mês/);

    const writes: FakeWrite[] = [];
    const incomeSaved = await runAgentV2TurnForContext({
      context: makeFakeContext(writes),
      message: "entrou 300 pix cliente joão",
      state: idleState,
    });
    assert.match(incomeSaved.reply, /Pronto, registrei essa entrada de R\$\s*300,00/);
    assert.equal(incomeSaved.state.status, "idle");
    assert.equal(writes.length, 1);
    assert.equal(writes[0]?.table, "movimentacoes");
    assert.equal(writes[0]?.payload.type, "entrada");
    assert.equal(writes[0]?.payload.amount, 300);

    const draftCases = [
      { amount: 50, message: "gastei 50 gasolina", pendingAction: "register_expense", reply: /despesa de R\$\s*50,00/i },
      { amount: 120, message: "paguei 120 internet", pendingAction: "register_expense", reply: /despesa de R\$\s*120,00/i },
      { amount: 500, message: "recebi 500 de venda", pendingAction: "register_income", reply: /entrada de R\$\s*500,00/i },
    ] as const;

    for (const draftCase of draftCases) {
      const caseWrites: FakeWrite[] = [];
      const draft = await runAgentV2TurnForContext({
        context: makeFakeContext(caseWrites),
        message: draftCase.message,
        state: idleState,
      });

      assert.equal(draft.state.status, "idle", draftCase.message);
      assert.match(draft.reply, draftCase.reply, draftCase.message);
      assert.doesNotMatch(draft.reply, /Posso salvar/i, draftCase.message);
      assert.equal(caseWrites.length, 1, draftCase.message);
      assert.equal(caseWrites[0]?.payload.amount, draftCase.amount, draftCase.message);
      assert.equal(caseWrites[0]?.payload.type, draftCase.pendingAction === "register_income" ? "entrada" : "despesa", draftCase.message);
    }

    const deleteWrites: FakeWrite[] = [];
    const savedExpenseForDelete = await runAgentV2TurnForContext({
      context: makeFakeContext(deleteWrites),
      message: "gastei 50 gasolina",
      state: idleState,
    });
    const deleteAsk = await runAgentV2TurnForContext({
      context: makeFakeContext(deleteWrites, movementsFromLastWrite(savedExpenseForDelete.state)),
      message: "apaga essa",
      state: savedExpenseForDelete.state,
    });
    assert.equal(deleteAsk.state.pendingAction, "delete_transaction");
    assert.equal(deleteAsk.state.status, "awaiting_confirmation");
    assert.match(deleteAsk.reply, /Quer mesmo excluir\?/);
    assert.equal(deleteWrites.filter((write) => write.payload.__delete).length, 0);

    const deleteConfirmed = await runAgentV2TurnForContext({
      context: makeFakeContext(deleteWrites, movementsFromLastWrite(savedExpenseForDelete.state)),
      message: "sim",
      state: deleteAsk.state,
    });
    assert.match(deleteConfirmed.reply, /exclu[ií]/i);
    assert.equal(deleteConfirmed.state.status, "idle");
    assert.equal(deleteWrites.filter((write) => write.payload.__delete).length, 1);

    const keepWrites: FakeWrite[] = [];
    const savedExpenseToKeep = await runAgentV2TurnForContext({
      context: makeFakeContext(keepWrites),
      message: "gastei 50 gasolina",
      state: idleState,
    });
    const keepAsk = await runAgentV2TurnForContext({
      context: makeFakeContext(keepWrites, movementsFromLastWrite(savedExpenseToKeep.state)),
      message: "apaga essa",
      state: savedExpenseToKeep.state,
    });
    const keepCancelled = await runAgentV2TurnForContext({
      context: makeFakeContext(keepWrites, movementsFromLastWrite(savedExpenseToKeep.state)),
      message: "não",
      state: keepAsk.state,
    });
    assert.match(keepCancelled.reply, /mantive esse lan[cç]amento/i);
    assert.equal(keepWrites.filter((write) => write.payload.__delete).length, 0);

    const valueEditWrites: FakeWrite[] = [];
    const savedExpenseForValueEdit = await runAgentV2TurnForContext({
      context: makeFakeContext(valueEditWrites),
      message: "gastei 50 gasolina",
      state: idleState,
    });
    const valueEditAsk = await runAgentV2TurnForContext({
      context: makeFakeContext(valueEditWrites, movementsFromLastWrite(savedExpenseForValueEdit.state)),
      message: "na verdade foi 60",
      state: savedExpenseForValueEdit.state,
    });
    assert.equal(valueEditAsk.state.pendingAction, "edit_transaction");
    assert.equal(valueEditAsk.state.status, "awaiting_confirmation");
    assert.equal(valueEditAsk.state.editDraft?.amount, 60);
    assert.match(valueEditAsk.reply, /Para: R\$\s*60,00/);
    assert.equal(valueEditWrites.filter((write) => write.payload.amount === 60).length, 0);

    const valueEditConfirmed = await runAgentV2TurnForContext({
      context: makeFakeContext(valueEditWrites, movementsFromLastWrite(savedExpenseForValueEdit.state)),
      message: "sim",
      state: valueEditAsk.state,
    });
    assert.match(valueEditConfirmed.reply, /R\$\s*60,00/);
    assert.equal(valueEditConfirmed.state.status, "idle");
    assert.equal(valueEditWrites.filter((write) => write.payload.amount === 60).length, 1);

    const descriptionEditWrites: FakeWrite[] = [];
    const savedIncomeForDescriptionEdit = await runAgentV2TurnForContext({
      context: makeFakeContext(descriptionEditWrites),
      message: "entrou 300 pix cliente joão",
      state: idleState,
    });
    const descriptionEditAsk = await runAgentV2TurnForContext({
      context: makeFakeContext(descriptionEditWrites, movementsFromLastWrite(savedIncomeForDescriptionEdit.state)),
      message: "muda a descrição para serviço mensal",
      state: savedIncomeForDescriptionEdit.state,
    });
    assert.equal(descriptionEditAsk.state.pendingAction, "edit_transaction");
    assert.equal(descriptionEditAsk.state.status, "awaiting_confirmation");
    assert.equal(normalizeDescription(descriptionEditAsk.state.editDraft?.description ?? ""), "servico mensal");
    assert.match(descriptionEditAsk.reply, /Para: Serviço mensal/i);

    const typeEditWrites: FakeWrite[] = [];
    const savedExpenseForTypeEdit = await runAgentV2TurnForContext({
      context: makeFakeContext(typeEditWrites),
      message: "gastei 50 gasolina",
      state: idleState,
    });
    const typeEditAsk = await runAgentV2TurnForContext({
      context: makeFakeContext(typeEditWrites, movementsFromLastWrite(savedExpenseForTypeEdit.state)),
      message: "era entrada, não despesa",
      state: savedExpenseForTypeEdit.state,
    });
    assert.equal(typeEditAsk.state.pendingAction, "edit_transaction");
    assert.equal(typeEditAsk.state.status, "awaiting_confirmation");
    assert.equal(typeEditAsk.state.editDraft?.type, "entrada");
    assert.equal(typeEditWrites.filter((write) => write.payload.type === "entrada").length, 0);

    const cancelAfterSaved = await runAgentV2TurnForContext({
      context: makeFakeContext(typeEditWrites, movementsFromLastWrite(savedExpenseForTypeEdit.state)),
      message: "cancela",
      state: savedExpenseForTypeEdit.state,
    });
    assert.equal(cancelAfterSaved.state.pendingAction, "delete_transaction");
    assert.equal(cancelAfterSaved.state.status, "awaiting_confirmation");
    assert.equal(typeEditWrites.filter((write) => write.payload.__delete).length, 0);

    const noRecentDelete = await runAgentV2TurnForContext({
      context: makeFakeContext([], []),
      message: "apaga essa",
      state: idleState,
    });
    assert.match(noRecentDelete.reply, /Não encontrei uma movimentação recente/i);
    assert.equal(noRecentDelete.state.status, "idle");

    const cancelWrites: FakeWrite[] = [];
    const cancelDraft = await runAgentV2TurnForContext({
      context: makeFakeContext(cancelWrites),
      message: "gastei 80",
      state: idleState,
    });
    const cancelled = await runAgentV2TurnForContext({
      context: makeFakeContext(cancelWrites),
      message: "cancela",
      state: cancelDraft.state,
    });
    assert.match(cancelled.reply, /não salvei|cancelei o rascunho/i);
    assert.equal(cancelled.state.status, "idle");
    assert.equal(cancelWrites.length, 0);

    const missingDescription = await runAgentV2TurnForContext({
      context: makeFakeContext(),
      message: "gastei 80",
      state: idleState,
    });
    assert.equal(missingDescription.state.pendingAction, "register_expense");
    assert.equal(missingDescription.state.status, "collecting");
    assert.deepEqual(missingDescription.state.missingFields, ["description"]);
    assert.match(missingDescription.reply, /foi com o quê|foi com o que|gasto de R\$\s*80,00/i);

    const missingAmount = await runAgentV2TurnForContext({
      context: makeFakeContext(),
      message: "entrou dinheiro",
      state: idleState,
    });
    assert.equal(missingAmount.state.pendingAction, "register_income");
    assert.equal(missingAmount.state.status, "collecting");
    assert.deepEqual(missingAmount.state.missingFields, ["amount"]);
    assert.match(missingAmount.reply, /valor/i);
    assert.notEqual(normalizeDescription(missingAmount.state.draft?.description ?? ""), "dinheiro");

    const amountForGenericIncome = await runAgentV2TurnForContext({
      context: makeFakeContext(),
      message: "120",
      state: missingAmount.state,
    });
    assert.equal(amountForGenericIncome.state.pendingAction, "register_income");
    assert.equal(amountForGenericIncome.state.status, "collecting");
    assert.deepEqual(amountForGenericIncome.state.missingFields, ["description"]);
    assert.match(amountForGenericIncome.reply, /referente|foi de|foi referente/i);

    const genericIncomeWrites: FakeWrite[] = [];
    const completedGenericIncome = await runAgentV2TurnForContext({
      context: makeFakeContext(genericIncomeWrites),
      message: "internet",
      state: amountForGenericIncome.state,
    });
    assert.match(completedGenericIncome.reply, /Pronto, registrei essa entrada de R\$\s*120,00/);
    assert.equal(completedGenericIncome.state.status, "idle");
    assert.equal(genericIncomeWrites.length, 1);
    assert.equal(normalizeDescription(genericIncomeWrites[0]?.payload.description ?? ""), "internet");
    assert.notEqual(normalizeDescription(genericIncomeWrites[0]?.payload.description ?? ""), "dinheiro");
    assert.doesNotMatch(completedGenericIncome.reply, /referente a qu[eê]|Posso salvar/i);

    const discountStart = await runAgentV2TurnForContext({
      context: makeFakeContext(),
      message: "entrou dinheiro",
      state: idleState,
    });
    const discountAmount = await runAgentV2TurnForContext({
      context: makeFakeContext(),
      message: "120",
      state: discountStart.state,
    });
    const discountWrites: FakeWrite[] = [];
    const discountSaved = await runAgentV2TurnForContext({
      context: makeFakeContext(discountWrites),
      message: "desconto",
      state: discountAmount.state,
    });
    assert.match(discountSaved.reply, /Pronto, registrei essa entrada de R\$\s*120,00/);
    assert.equal(discountSaved.state.status, "idle");
    assert.equal(discountWrites.length, 1);
    assert.equal(normalizeDescription(discountWrites[0]?.payload.description ?? ""), "desconto");
    assert.doesNotMatch(discountSaved.reply, /referente a qu[eê]|Posso salvar/i);

    const ambiguousWrites: FakeWrite[] = [];
    const ambiguous = await runAgentV2TurnForContext({
      context: makeFakeContext(ambiguousWrites),
      message: "lança 200",
      state: idleState,
    });
    assert.equal(ambiguous.state.status, "collecting");
    assert.equal(ambiguous.state.expectedResponseKind, "choose_movement_type");
    assert.equal(ambiguous.state.draft?.amount, 200);
    assert.match(ambiguous.reply, /R\$\s*200,00/);
    assert.match(ambiguous.reply, /entrada ou despesa/i);

    const persistedAmbiguousSnapshot = await loadAgentConversationSnapshot({
      channel: "whatsapp",
      supabase: {
        from: (table: string) => makeFakeQuery(
          table === "agent_conversations"
            ? [
                {
                  channel: "whatsapp",
                  draft: {
                    ...(ambiguous.state.draft ?? {}),
                    __expectedResponseKind: ambiguous.state.expectedResponseKind,
                  },
                  id: "fake-conversation-id",
                  missing_fields: ambiguous.state.missingFields ?? [],
                  pending_action: ambiguous.state.pendingAction ?? null,
                  status: ambiguous.state.status,
                  updated_at: new Date().toISOString(),
                  user_id: "test-user",
                },
              ]
            : [],
          table,
          [],
        ),
      },
      userId: "test-user",
    } as any, { includeMessages: false });
    assert.equal(persistedAmbiguousSnapshot.state.status, "collecting");
    assert.equal(persistedAmbiguousSnapshot.state.expectedResponseKind, "choose_movement_type");
    assert.equal(persistedAmbiguousSnapshot.state.draft?.amount, 200);
    assert.deepEqual(
      getAgentV2WhatsAppRouteDecision({
        message: "entrada",
        remoteNumber: "5511999999999",
        source: "text",
        state: persistedAmbiguousSnapshot.state,
        userId: "test-user",
      }),
      { enabled: true, reason: "enabled" },
    );

    const chosenIncome = await runAgentV2TurnForContext({
      context: makeFakeContext(ambiguousWrites),
      message: "entrada",
      state: persistedAmbiguousSnapshot.state,
    });
    assert.equal(chosenIncome.state.pendingAction, "register_income");
    assert.equal(chosenIncome.state.status, "collecting");
    assert.equal(chosenIncome.state.draft?.amount, 200);
    assert.deepEqual(chosenIncome.state.missingFields, ["description"]);
    assert.match(chosenIncome.reply, /R\$\s*200,00/);
    assert.match(chosenIncome.reply, /referente/i);
    assert.doesNotMatch(chosenIncome.reply, /Qual foi o valor/i);

    const ambiguousSaved = await runAgentV2TurnForContext({
      context: makeFakeContext(ambiguousWrites),
      message: "pix",
      state: chosenIncome.state,
    });
    assert.match(ambiguousSaved.reply, /Pronto, registrei essa entrada de R\$\s*200,00/);
    assert.equal(ambiguousSaved.state.status, "idle");
    assert.equal(ambiguousWrites.length, 1);
    assert.equal(ambiguousWrites[0]?.payload.amount, 200);
    assert.equal(ambiguousWrites[0]?.payload.type, "entrada");
    assert.equal(normalizeDescription(ambiguousWrites[0]?.payload.description ?? ""), "pix");
    assert.doesNotMatch(ambiguousSaved.reply, /Posso salvar/i);

    const batchWrites: FakeWrite[] = [];
    const batchDraft = await runAgentV2TurnForContext({
      context: makeFakeContext(batchWrites),
      message: "entrou 300 do João, gastei 50 gasolina e paguei 120 internet",
      state: idleState,
    });
    assert.equal(batchDraft.state.pendingAction, "register_movements_batch");
    assert.equal(batchDraft.state.status, "awaiting_confirmation");
    assert.match(batchDraft.reply, /Posso salvar tudo\?/);
    assert.equal(batchWrites.length, 0);

    const v2EditWrites: FakeWrite[] = [];
    const v2Edit = await runAgentV2TurnForContext({
      context: makeFakeContext(v2EditWrites),
      message: "muda a descrição da última entrada para pix cliente joão",
      state: idleState,
    });
    assert.equal(v2Edit.state.pendingAction, "edit_transaction");
    assert.equal(v2Edit.state.status, "awaiting_confirmation");
    assert.match(v2Edit.reply, /Posso confirmar essa alteração\?/);
    assert.equal(v2EditWrites.length, 0);

    const v2Delete = await runAgentV2TurnForContext({
      context: makeFakeContext(),
      message: "exclui a última movimentação",
      state: idleState,
    });
    assert.equal(v2Delete.state.pendingAction, "delete_transaction");
    assert.equal(v2Delete.state.status, "awaiting_confirmation");
    assert.match(v2Delete.reply, /Quer mesmo excluir\?/);
  } finally {
    process.env.HELENA_V2_ENABLED = originalEnabled;
    process.env.HELENA_V2_ALLOW_ALL = originalAllowAll;
    process.env.HELENA_V2_USER_IDS = originalUserIds;
    process.env.HELENA_V2_WHATSAPP_NUMBERS = originalNumbers;
    process.env.HELENA_FORCE_V1 = originalForceV1;
    process.env.HELENA_USE_V1_FALLBACK = originalUseV1Fallback;
    process.env.HELENA_V2_GEMINI_ENABLED = originalGeminiEnabled;
  }
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

function getMonthTitleFromRangeLabel(label: string) {
  return label.replace(/^em\s+/i, "");
}

function getMonthNameFromRangeLabel(label: string) {
  return getMonthTitleFromRangeLabel(label).replace(/\s+de\s+\d{4}$/i, "");
}

function formatDateForRegex(value: string) {
  const [year, month, day] = value.split("-");

  return `${day}/${month}/${year}`;
}

function formatCurrencyNumberForRegex(value: number) {
  return value.toLocaleString("pt-BR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function makeDateInRange(range: { end: string; start: string }, day: number) {
  const [year, month] = range.start.split("-");
  const lastDay = Number(range.end.split("-")[2] ?? day);

  return `${year}-${month}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function movementsFromLastWrite(state: { lastWrite?: { target: any } }) {
  const target = state.lastWrite?.target;

  if (!target) {
    throw new Error("Expected lastWrite target in test state.");
  }

  return [
    {
      ...target,
      created_at: `${target.occurred_on}T12:00:00Z`,
      user_id: "test-user",
    },
  ];
}

function makeFakeContext(writes: FakeWrite[] = [], movements: unknown[] = getDefaultFakeMovements()) {
  return {
    supabase: {
      from: (table: string) => makeFakeQuery(
        table === "movimentacoes" ? movements : [],
        table,
        writes,
      ),
      rpc: async () => ({ data: null, error: null }),
    },
    userId: "test-user",
  } as any;
}

function getDefaultFakeMovements() {
  const currentMonthRange = resolveQuickPeriodRange(
    { format: "report", metric: "summary", range: "this_month", type: "period" },
    new Date(),
  );
  const lastMonthRange = resolveQuickPeriodRange(
    { format: "report", metric: "summary", range: "last_month", type: "period" },
    new Date(),
  );
  const currentMonthName = getMonthNameFromRangeLabel(currentMonthRange.label);
  const lastMonthName = getMonthNameFromRangeLabel(lastMonthRange.label);
  const lastMonthMovements = lastMonthRange.start === "2026-04-01"
    ? []
    : [
        { amount: 300, category: "Venda", created_at: `${makeDateInRange(lastMonthRange, 10)}T12:00:00Z`, description: `cliente ${lastMonthName}`, id: "fake-last-month-income-id", occurred_on: makeDateInRange(lastMonthRange, 10), type: "entrada", user_id: "test-user" },
        { amount: 90, category: "Internet", created_at: `${makeDateInRange(lastMonthRange, 8)}T12:00:00Z`, description: `internet ${lastMonthName}`, id: "fake-last-month-expense-id", occurred_on: makeDateInRange(lastMonthRange, 8), type: "despesa", user_id: "test-user" },
      ];

  return [
    { amount: 500, category: "Venda", created_at: `${makeDateInRange(currentMonthRange, 10)}T12:00:00Z`, description: `cliente ${currentMonthName}`, id: "fake-current-month-income-id", occurred_on: makeDateInRange(currentMonthRange, 10), type: "entrada", user_id: "test-user" },
    { amount: 100, category: "Internet", created_at: `${makeDateInRange(currentMonthRange, 8)}T12:00:00Z`, description: `internet ${currentMonthName}`, id: "fake-current-month-expense-id", occurred_on: makeDateInRange(currentMonthRange, 8), type: "despesa", user_id: "test-user" },
    ...lastMonthMovements,
    { amount: 200, category: "Venda", created_at: "2026-04-27T12:00:00Z", description: "cliente antigo", id: "fake-income-id", occurred_on: "2026-04-27", type: "entrada", user_id: "test-user" },
    { amount: 80, category: "Alimentação", created_at: "2026-04-27T11:00:00Z", description: "mercado", id: "fake-expense-id", occurred_on: "2026-04-27", type: "despesa", user_id: "test-user" },
  ];
}

function makeFakeQuery(data: unknown[], table: string, writes: FakeWrite[]) {
  let result = { data: Array.isArray(data) ? [...data] as unknown[] : data as unknown, error: null };
  let deleteMode = false;
  let pendingUpdate: any = null;

  const updateResult = (nextData: unknown) => {
    result = { data: nextData, error: null };
  };

  const filterRows = (predicate: (row: Record<string, any>) => boolean) => {
    if (Array.isArray(result.data)) {
      updateResult(result.data.filter((row) => predicate(row as Record<string, any>)));
    }
  };

  const query = {
    eq: (field: string, value: unknown) => {
      filterRows((row) => row[field] === value);
      return query;
    },
    delete: () => {
      deleteMode = true;
      return query;
    },
    gte: (field: string, value: unknown) => {
      filterRows((row) => String(row[field] ?? "") >= String(value));
      return query;
    },
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
    ilike: (field: string, pattern: string) => {
      const needle = pattern.replace(/[%_]/g, "").toLocaleLowerCase("pt-BR");
      filterRows((row) => String(row[field] ?? "").toLocaleLowerCase("pt-BR").includes(needle));
      return query;
    },
    lte: (field: string, value: unknown) => {
      filterRows((row) => String(row[field] ?? "") <= String(value));
      return query;
    },
    limit: (count: number) => {
      if (Array.isArray(result.data)) {
        updateResult(result.data.slice(0, count));
      }
      return query;
    },
    maybeSingle: async () => ({ data: Array.isArray(result.data) ? result.data[0] ?? null : result.data, error: null }),
    order: (field: string, options: { ascending?: boolean } = {}) => {
      if (Array.isArray(result.data)) {
        const ascending = options.ascending ?? true;
        updateResult([...result.data].sort((left: any, right: any) => {
          const leftValue = left[field] ?? "";
          const rightValue = right[field] ?? "";

          if (leftValue === rightValue) {
            return 0;
          }

          return (leftValue > rightValue ? 1 : -1) * (ascending ? 1 : -1);
        }));
      }
      return query;
    },
    select: () => query,
    single: async () => {
      if (pendingUpdate) {
        const base = Array.isArray(result.data) ? result.data[0] ?? {} : result.data ?? {};
        const updated = { ...base, ...pendingUpdate };
        writes.push({ payload: pendingUpdate, table });
        result = {
          data: updated,
          error: null,
        };
        pendingUpdate = null;
      }

      return { data: Array.isArray(result.data) ? result.data[0] : result.data, error: null };
    },
    then: (resolve: (value: typeof result) => void) => {
      if (deleteMode) {
        writes.push({ payload: { __delete: true, rows: result.data }, table });
        result = { data: null, error: null };
        deleteMode = false;
      }

      resolve(result);
    },
    update: (payload: any) => {
      pendingUpdate = payload;
      return query;
    },
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
