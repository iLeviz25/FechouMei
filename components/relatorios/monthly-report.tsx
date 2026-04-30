import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  FileText,
  Landmark,
  ReceiptText,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { ReportActions } from "@/components/relatorios/report-actions";
import { ReportTransactionsList } from "@/components/relatorios/report-transactions-list";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  MonthlyReportData,
  ReportCategorySummary,
  ReportObligationSummary,
} from "@/lib/relatorios/types";

type MonthlyReportProps = {
  report: MonthlyReportData;
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency",
});

const percentFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

export function MonthlyReport({ report }: MonthlyReportProps) {
  return (
    <div className="mx-auto w-full max-w-[1080px] space-y-5 print:max-w-none print:space-y-4">
      <section className="print:hidden">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <Badge className="w-fit border-0 bg-primary-soft px-3 py-1 text-primary shadow-none">
              RELATORIO
            </Badge>
            <div>
              <h1 className="text-[2rem] font-extrabold tracking-tight text-foreground sm:text-[2.45rem]">
                Relatorio do mes
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Gere um resumo mensal para conferencia propria ou envio ao contador.
              </p>
            </div>
          </div>
        </div>
      </section>

      <ReportActions monthValue={report.identification.monthValue} movements={report.movements} />

      <section className="print-report-root space-y-5 rounded-[30px] bg-white/72 p-1 print:rounded-none print:bg-white print:p-0">
        <div className="print-break-inside-avoid rounded-[28px] bg-gradient-hero p-5 text-primary-foreground print:rounded-[18px] print:p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between print:flex-row print:gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary-foreground/70">
                FechouMEI
              </p>
              <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl print:text-2xl">
                Relatorio mensal - {report.identification.monthLabel}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-primary-foreground/78 print:max-w-[31rem] print:text-[12px] print:leading-5">
                Este relatorio e uma conferencia operacional e nao substitui orientacao contabil.
              </p>
            </div>
            <div className="shrink-0 rounded-[22px] bg-white/12 px-4 py-3 text-sm print:min-w-[13.5rem] print:rounded-[14px] print:border print:border-white/20 print:bg-white/12 print:px-3 print:py-2.5">
              <p className="font-bold">{report.identification.fullName ?? "Usuario FechouMEI"}</p>
              <p className="mt-1 break-words text-primary-foreground/72 print:text-[11px] print:leading-4">
                {report.identification.email ?? "E-mail nao informado"}
              </p>
            </div>
          </div>
        </div>

        <section className="grid gap-3 md:grid-cols-4 print:grid-cols-4 print:gap-2">
          <SummaryCard
            icon={ArrowDownLeft}
            label="Entradas"
            tone="success"
            value={toCurrency(report.summary.totalIncome)}
            detail={`${report.summary.incomeCount} lancamentos`}
          />
          <SummaryCard
            icon={ArrowUpRight}
            label="Despesas"
            tone="danger"
            value={toCurrency(report.summary.totalExpense)}
            detail={`${report.summary.expenseCount} lancamentos`}
          />
          <SummaryCard
            icon={Wallet}
            label="Saldo do mes"
            tone={report.summary.balance >= 0 ? "neutral" : "danger"}
            value={toCurrency(report.summary.balance)}
            detail={`${report.summary.totalMovements} movimentacoes`}
          />
          <SummaryCard
            icon={Landmark}
            label="Limite MEI"
            tone={report.meiLimit.status.tone === "danger" ? "danger" : "success"}
            value={`${formatPercent(report.meiLimit.usageDisplayPercent)}%`}
            detail={report.meiLimit.status.label}
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] print:grid-cols-2">
          <Card className="print-break-inside-avoid print:shadow-none">
            <CardContent className="space-y-4 p-5 print:p-4">
              <SectionTitle
                description="Dados usados para identificar o mes de referencia."
                icon={FileText}
                title="Identificacao"
              />
              <div className="grid gap-3 sm:grid-cols-2 print:grid-cols-2">
                <InfoRow label="Nome / MEI" value={report.identification.fullName ?? "Nao informado"} />
                <InfoRow label="E-mail" value={report.identification.email ?? "Nao informado"} />
                <InfoRow label="Atuacao" value={report.identification.workType ?? "Nao informado"} />
                <InfoRow label="Tipo de trabalho" value={report.identification.businessMode ?? "Nao informado"} />
                <InfoRow label="Categoria principal" value={report.identification.mainCategory ?? "Nao informado"} />
                <InfoRow label="Mes" value={report.identification.monthLabel} />
              </div>
            </CardContent>
          </Card>

          <Card className="print-break-inside-avoid print:shadow-none">
            <CardContent className="space-y-4 p-5 print:p-4">
              <SectionTitle
                description="Acompanhamento do teto anual de faturamento do MEI."
                icon={Landmark}
                title="Faturamento e limite MEI"
              />
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      Faturamento acumulado no ano
                    </p>
                    <p className="mt-2 font-mono text-2xl font-extrabold tabular text-foreground">
                      {toCurrency(report.meiLimit.annualIncome)}
                    </p>
                  </div>
                  <Badge className={cn("w-fit border-0 px-3 py-1 shadow-none", limitBadgeClass(report.meiLimit.status.tone))}>
                    {report.meiLimit.status.label}
                  </Badge>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", report.meiLimit.status.progressClass)}
                    style={{ width: `${report.meiLimit.usagePercent}%` }}
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-3 print:grid-cols-3">
                  <InfoRow label="Limite anual" value={toCurrency(report.meiLimit.limit)} />
                  <InfoRow label="Usado" value={`${formatPercent(report.meiLimit.usageDisplayPercent)}%`} />
                  <InfoRow
                    label={report.meiLimit.exceededLimit > 0 ? "Acima do limite" : "Restante"}
                    value={toCurrency(
                      report.meiLimit.exceededLimit > 0
                        ? report.meiLimit.exceededLimit
                        : report.meiLimit.remainingLimit,
                    )}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-2 print:grid-cols-2">
          <CategorySection
            categories={report.categories.entradas}
            emptyLabel="Nenhuma entrada categorizada neste mes."
            title="Categorias de entradas"
            tone="success"
          />
          <CategorySection
            categories={report.categories.despesas}
            emptyLabel="Nenhuma despesa categorizada neste mes."
            title="Categorias de despesas"
            tone="danger"
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.88fr_1.12fr] print:grid-cols-2">
          <Card className="print-break-inside-avoid print:shadow-none">
            <CardContent className="space-y-4 p-5 print:p-4">
              <SectionTitle
                description={`${report.obligations.totalDone} concluidas . ${report.obligations.totalPending} pendentes`}
                icon={CheckCircle2}
                title="Obrigacoes do mes"
              />
              <div className="space-y-2">
                {report.obligations.items.map((item) => (
                  <ObligationRow item={item} key={item.key} />
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="print-break-inside-avoid print:shadow-none">
            <CardContent className="space-y-4 p-5 print:p-4">
              <SectionTitle
                description="Resumo gerado com base nos registros informados pelo usuario."
                icon={ReceiptText}
                title="Observacoes finais"
              />
              <div className="rounded-[22px] bg-primary-soft/55 p-4 text-sm leading-6 text-foreground print:border print:border-border print:bg-white">
                <p>
                  Relatorio gerado pelo FechouMEI com base nos registros informados pelo usuario.
                </p>
                <p className="mt-2 text-muted-foreground">
                  Confira valores, categorias e obrigacoes antes de enviar ao contador ou usar como apoio na sua rotina.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="print-break-inside-avoid">
          <Card className="overflow-hidden print:overflow-visible print:rounded-none print:shadow-none">
            <CardContent className="p-0">
              <div className="flex flex-col gap-2 border-b border-border/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between print:px-0">
                <SectionTitle
                  description={`${report.movements.length} lancamentos no periodo`}
                  icon={ReceiptText}
                  title="Movimentacoes do mes"
                />
              </div>
              <ReportTransactionsList movements={report.movements} />
            </CardContent>
          </Card>
        </section>
      </section>
    </div>
  );
}

function SummaryCard({
  detail,
  icon: Icon,
  label,
  tone,
  value,
}: {
  detail: string;
  icon: LucideIcon;
  label: string;
  tone: "success" | "danger" | "neutral";
  value: string;
}) {
  return (
    <div
      className={cn(
        "print-break-inside-avoid rounded-[24px] border p-4 print:rounded-xl print:p-3",
        tone === "success" && "border-primary/14 bg-primary/5",
        tone === "danger" && "border-destructive/14 bg-destructive/5",
        tone === "neutral" && "border-border bg-card",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
          <p
            className={cn(
              "mt-3 whitespace-nowrap font-mono text-[1.45rem] font-extrabold leading-none tabular print:text-lg",
              tone === "success" && "text-primary",
              tone === "danger" && "text-destructive",
              tone === "neutral" && "text-foreground",
            )}
          >
            {value}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
        </div>
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl print:hidden",
            tone === "success" && "bg-primary/10 text-primary",
            tone === "danger" && "bg-destructive/10 text-destructive",
            tone === "neutral" && "bg-muted text-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function SectionTitle({
  description,
  icon: Icon,
  title,
}: {
  description: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary print:hidden">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <h3 className="text-base font-extrabold tracking-tight text-foreground">{title}</h3>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-border/70 bg-white/75 px-3 py-3 print:rounded-lg print:bg-white print:px-2 print:py-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

function CategorySection({
  categories,
  emptyLabel,
  title,
  tone,
}: {
  categories: ReportCategorySummary[];
  emptyLabel: string;
  title: string;
  tone: "success" | "danger";
}) {
  return (
    <Card className="print-break-inside-avoid print:shadow-none">
      <CardContent className="space-y-4 p-5 print:p-4">
        <SectionTitle
          description="Totais por categoria no mes selecionado."
          icon={tone === "success" ? ArrowDownLeft : ArrowUpRight}
          title={title}
        />
        {categories.length === 0 ? (
          <p className="rounded-[18px] bg-muted/60 px-4 py-4 text-sm font-semibold text-muted-foreground">
            {emptyLabel}
          </p>
        ) : (
          <div className="space-y-2">
            {categories.map((category) => (
              <div
                className="grid grid-cols-[1fr_auto] gap-3 rounded-[18px] border border-border/70 bg-white/75 px-3 py-3 print:rounded-lg print:bg-white"
                key={`${category.type}-${category.category}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-foreground">{category.category}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {category.count} lanc. . {formatPercent(category.percent)}% do total
                  </p>
                </div>
                <p
                  className={cn(
                    "whitespace-nowrap font-mono text-sm font-extrabold tabular",
                    tone === "success" ? "text-primary" : "text-destructive",
                  )}
                >
                  {toCurrency(category.total)}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ObligationRow({ item }: { item: ReportObligationSummary }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[18px] border border-border/70 bg-white/75 px-3 py-3 print:rounded-lg print:bg-white">
      <div className="min-w-0">
        <p className="text-sm font-extrabold text-foreground">{item.label}</p>
        <p className="mt-1 text-xs text-muted-foreground">Status do checklist do mes</p>
      </div>
      <Badge
        className={cn(
          "shrink-0 border-0 shadow-none",
          item.done ? "bg-primary-soft text-primary" : "bg-secondary-soft text-secondary-foreground",
        )}
      >
        {item.statusLabel}
      </Badge>
    </div>
  );
}

function limitBadgeClass(tone: MonthlyReportData["meiLimit"]["status"]["tone"]) {
  if (tone === "danger") {
    return "bg-destructive/10 text-destructive";
  }

  if (tone === "orange") {
    return "bg-secondary-soft text-secondary-foreground";
  }

  if (tone === "warning") {
    return "bg-secondary-soft text-secondary-foreground";
  }

  return "bg-primary-soft text-primary";
}

function toCurrency(value: number) {
  return currencyFormatter.format(value);
}

function formatPercent(value: number) {
  return percentFormatter.format(value);
}
