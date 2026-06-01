import { buildAppUrl } from "@/lib/app-url";
import type { ImportSummary } from "@/lib/import/types";

type WhatsAppImportConfirmationResult = {
  importedCount?: number;
  importedExpenseAmount?: number;
  importedExpenseCount?: number;
  importedIncomeAmount?: number;
  importedIncomeCount?: number;
  message: string;
  ok: boolean;
  reviewUrl?: string;
  skippedDuplicateCount?: number;
};

export function buildWhatsAppImportSessionReply(summary: ImportSummary, reviewUrl: string | null) {
  const duplicateCount = summary.duplicateExistingCount + summary.duplicateFileCount;
  const newCount = summary.importableCount;

  if (newCount === 0 && duplicateCount > 0) {
    return [
      "Esse arquivo parece já ter sido importado antes ✅",
      "",
      `Encontrei ${formatCount(duplicateCount, "movimentação", "movimentações")}, mas ${duplicateCount === 1 ? "ela parece" : "elas parecem"} já existir no FechouMEI.`,
      "",
      "Não importei de novo para evitar duplicidade.",
      getReviewInstruction(reviewUrl, "Se quiser conferir,"),
    ].filter(Boolean).join("\n");
  }

  if (newCount === 0) {
    return [
      "Não encontrei movimentações válidas para importar nesse arquivo.",
      "",
      summary.totalRows > 0
        ? "Você pode revisar a planilha no app em Importar dados e tentar enviar de novo."
        : "Você pode revisar a planilha e tentar enviar de novo.",
      reviewUrl ? `Link da revisão: ${reviewUrl}` : null,
    ].filter(Boolean).join("\n");
  }

  const lines = [
    "Recebi sua planilha ✅",
    "",
    `Encontrei ${formatCount(newCount, "movimentação", "movimentações")} para importar:`,
    "",
    buildAmountLine(summary.incomeCount, "entrada", "entradas", summary.incomeAmount),
    buildAmountLine(summary.expenseCount, "despesa", "despesas", summary.expenseAmount),
  ];

  if (summary.errorCount > 0) {
    lines.push(buildCountLine(summary.errorCount, "linha com erro", "linhas com erro"));
  }

  if (duplicateCount > 0) {
    lines.push("");
    lines.push(`Também encontrei ${formatCount(duplicateCount, "possível duplicidade", "possíveis duplicidades")}. Vale revisar antes de confirmar.`);
  }

  if (summary.errorCount > 0) {
    lines.push("");
    lines.push("Antes de importar, recomendo revisar essas linhas no app em Importar dados.");
    if (reviewUrl) {
      lines.push(`Link da revisão: ${reviewUrl}`);
    }
    return lines.join("\n");
  }

  if (duplicateCount === 0) {
    lines.push("");
    lines.push("Não encontrei erros nem possíveis duplicidades.");
  }

  lines.push("");
  lines.push(duplicateCount > 0
    ? "Para importar apenas as novas agora, responda: confirmar."
    : "Para importar tudo agora, responda: confirmar.");
  lines.push(getReviewInstruction(reviewUrl, "Se quiser revisar antes,"));

  return lines.filter(Boolean).join("\n");
}

export function buildWhatsAppImportConfirmationReply(result: WhatsAppImportConfirmationResult) {
  if (!result.ok) {
    if (result.reviewUrl) {
      const reviewUrl = buildAppUrl(result.reviewUrl);
      return [
        result.message,
        "",
        reviewUrl ?? "Abra o app em Importar dados para revisar.",
      ].join("\n");
    }

    return result.message;
  }

  if (!result.importedCount || result.importedCount <= 0) {
    if (result.skippedDuplicateCount && result.skippedDuplicateCount > 0) {
      return [
        "Esse arquivo parece já ter sido importado antes ✅",
        "",
        "Não importei de novo para evitar duplicidade.",
        "",
        "Você pode conferir as movimentações já salvas em Movimentações.",
      ].join("\n");
    }

    return "Não encontrei movimentações válidas para importar nesse arquivo. Você pode revisar a planilha e tentar enviar de novo.";
  }

  return [
    "Pronto, importei sua planilha ✅",
    "",
    `Foram adicionadas ${formatCount(result.importedCount, "movimentação", "movimentações")} no FechouMEI:`,
    "",
    buildAmountLine(result.importedIncomeCount ?? 0, "entrada", "entradas", result.importedIncomeAmount ?? 0),
    buildAmountLine(result.importedExpenseCount ?? 0, "despesa", "despesas", result.importedExpenseAmount ?? 0),
    result.skippedDuplicateCount && result.skippedDuplicateCount > 0
      ? `Também ignorei ${formatCount(result.skippedDuplicateCount, "possível duplicidade", "possíveis duplicidades")} para não repetir lançamentos.`
      : null,
    "",
    "Você já pode conferir tudo em Movimentações.",
  ].filter(Boolean).join("\n");
}

function buildAmountLine(count: number, singular: string, plural: string, amount: number) {
  return `• ${count} ${count === 1 ? singular : plural} — ${formatCurrency(amount)}`;
}

function buildCountLine(count: number, singular: string, plural: string) {
  return `• ${count} ${count === 1 ? singular : plural}`;
}

function formatCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getReviewInstruction(reviewUrl: string | null, prefix: string) {
  void reviewUrl;

  return `${prefix} você pode abrir o app e ir em Importar dados.`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency",
  }).format(value);
}
