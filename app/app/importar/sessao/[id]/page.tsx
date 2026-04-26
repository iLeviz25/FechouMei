import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  FileSpreadsheet,
  MessageCircle,
} from "lucide-react";
import { ImportSessionActions } from "@/components/importar/import-session-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getImportReviewSessionForCurrentUser } from "@/lib/import/sessions";
import { cn } from "@/lib/utils";
import type { ImportPreviewRow } from "@/lib/import/types";

export const dynamic = "force-dynamic";

type SessionParams = {
  id: string;
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency",
});

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
  year: "numeric",
});

function toCurrency(value: number) {
  return currencyFormatter.format(value);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sem data" : dateTimeFormatter.format(date);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    cancelled: "Cancelada",
    draft: "Aguardando revisao",
    expired: "Expirada",
    failed: "Falhou",
    imported: "Importada",
    reviewed: "Revisada",
  };

  return labels[status] ?? status;
}

function rowStatusLabel(row: ImportPreviewRow) {
  const labels: Record<ImportPreviewRow["status"], string> = {
    duplicate_existing: "Duplicada no app",
    duplicate_file: "Duplicada no arquivo",
    error: "Com erro",
    valid: "Valida",
  };

  return labels[row.status];
}

function SummaryBox({
  label,
  tone = "neutral",
  value,
}: {
  label: string;
  tone?: "danger" | "neutral" | "success" | "warning";
  value: string;
}) {
  return (
    <div className="rounded-[22px] border border-border/70 bg-muted/25 p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-2 font-mono text-2xl font-extrabold leading-none",
          tone === "neutral" && "text-foreground",
          tone === "success" && "text-primary",
          tone === "danger" && "text-destructive",
          tone === "warning" && "text-secondary-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function AmountBox({
  icon: Icon,
  label,
  tone,
  value,
}: {
  icon: typeof ArrowDownLeft;
  label: string;
  tone: "danger" | "success";
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[24px] border border-border/70 bg-card/80 p-4">
      <div
        className={cn(
          "icon-tile flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
          tone === "success" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive",
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        <p className={cn("mt-1 font-mono text-lg font-extrabold", tone === "success" ? "text-primary" : "text-destructive")}>
          {value}
        </p>
      </div>
    </div>
  );
}

function RowStatus({ row }: { row: ImportPreviewRow }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em]",
        row.status === "valid" && "bg-success/10 text-success",
        row.status === "error" && "bg-destructive/10 text-destructive",
        (row.status === "duplicate_file" || row.status === "duplicate_existing") && "bg-secondary-soft text-secondary-foreground",
      )}
      title={row.errors.join(" ")}
    >
      {row.status === "valid" ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {rowStatusLabel(row)}
    </span>
  );
}

function PreviewTableRow({ row }: { row: ImportPreviewRow }) {
  const income = row.type === "entrada";

  return (
    <div className="grid grid-cols-[5rem_minmax(0,1.3fr)_7rem_8rem_8rem_8rem] items-center gap-3 px-5 py-3 text-sm">
      <span className="font-mono text-xs text-muted-foreground">{row.occurred_on ?? "-"}</span>
      <span className="truncate font-semibold text-foreground">{row.description || "-"}</span>
      <Badge className={income ? "border-primary/15 bg-primary/10 text-primary" : "border-destructive/15 bg-destructive/10 text-destructive"} variant="outline">
        {row.type ?? "-"}
      </Badge>
      <span className="truncate text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{row.category}</span>
      <span className={cn("font-mono font-extrabold tabular", income ? "text-primary" : "text-destructive")}>
        {row.amount !== null ? toCurrency(row.amount) : "-"}
      </span>
      <RowStatus row={row} />
    </div>
  );
}

function PreviewCard({ row }: { row: ImportPreviewRow }) {
  const income = row.type === "entrada";

  return (
    <div className="space-y-3 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-foreground">{row.description || `Linha ${row.rowNumber}`}</p>
          <p className="mt-1 text-xs text-muted-foreground">{row.occurred_on ?? "Data invalida"}</p>
        </div>
        <p className={cn("font-mono text-sm font-extrabold tabular", income ? "text-primary" : "text-destructive")}>
          {row.amount !== null ? toCurrency(row.amount) : "-"}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={income ? "border-primary/15 bg-primary/10 text-primary" : "border-destructive/15 bg-destructive/10 text-destructive"} variant="outline">
          {row.type ?? "Tipo invalido"}
        </Badge>
        <span className="rounded-full bg-muted/65 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          {row.category}
        </span>
        <RowStatus row={row} />
      </div>
      {row.errors.length > 0 ? <p className="text-xs font-semibold leading-5 text-destructive">{row.errors.join(" ")}</p> : null}
    </div>
  );
}

export default async function ImportSessionPage({ params }: { params: Promise<SessionParams> }) {
  const { id } = await params;
  const view = await getImportReviewSessionForCurrentUser(id);

  if (!view) {
    notFound();
  }

  const expired = new Date(view.session.expires_at).getTime() < Date.now();
  const locked = expired || !["draft", "reviewed"].includes(view.session.status);
  const duplicateCount = view.summary.duplicateExistingCount + view.summary.duplicateFileCount;

  return (
    <div className="mobile-section-gap">
      <header className="space-y-3">
        <Button asChild variant="outline">
          <Link href="/app/importar">
            <ArrowLeft className="h-4 w-4" />
            Voltar para Importar dados
          </Link>
        </Button>
        <Badge className="w-fit" variant="success">
          <MessageCircle className="mr-1 h-3 w-3" />
          Importacao da Helena
        </Badge>
        <div className="max-w-2xl space-y-1.5">
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">Revisar importacao da Helena</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            A Helena preparou esta importacao a partir do arquivo enviado no WhatsApp. Revise antes de salvar.
          </p>
        </div>
      </header>

      {expired ? (
        <Card className="overflow-hidden rounded-[28px] border-secondary/20 bg-secondary-soft/60">
          <CardContent className="p-5 text-sm font-semibold leading-6 text-secondary-foreground">
            Essa revisao expirou. Envie o arquivo novamente para a Helena.
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden rounded-[32px]">
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3">
              <div className="icon-tile flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] bg-primary-soft text-primary">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Arquivo recebido</p>
                <h2 className="mt-1 text-xl font-extrabold tracking-tight text-foreground">{view.session.file_name ?? "Planilha do WhatsApp"}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Origem: WhatsApp · Enviado em {formatDateTime(view.session.created_at)} · Expira em {formatDateTime(view.session.expires_at)}
                </p>
              </div>
            </div>
            <Badge variant={view.session.status === "imported" ? "success" : view.session.status === "failed" ? "danger" : "secondary"}>
              {statusLabel(view.session.status)}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryBox label="Linhas" value={String(view.summary.totalRows)} />
            <SummaryBox label="Com erro" tone="danger" value={String(view.summary.errorCount)} />
            <SummaryBox label="Duplicadas" tone="warning" value={String(duplicateCount)} />
            <SummaryBox label="Validas" tone="success" value={String(view.summary.importableCount)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <AmountBox icon={ArrowDownLeft} label={`${view.summary.incomeCount} entradas`} tone="success" value={toCurrency(view.summary.incomeAmount)} />
            <AmountBox icon={ArrowUpRight} label={`${view.summary.expenseCount} despesas`} tone="danger" value={toCurrency(view.summary.expenseAmount)} />
          </div>

          <ImportSessionActions disabled={locked} importableCount={view.summary.importableCount} sessionId={view.session.id} />

          {view.session.status === "imported" ? (
            <div className="flex flex-wrap gap-2 rounded-[24px] border border-primary/15 bg-primary-soft/45 p-4">
              <p className="basis-full text-sm font-semibold leading-6 text-primary">
                Importacao concluida. Confira as movimentacoes criadas no app.
              </p>
              <Button asChild size="sm">
                <Link href="/app/movimentacoes">Ver movimentacoes</Link>
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-[32px]">
        <CardContent className="p-0">
          <div className="border-b border-border/70 px-4 py-4 sm:px-5">
            <h2 className="text-lg font-extrabold tracking-tight text-foreground">Linhas detectadas</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Linhas com erro ou duplicadas serao ignoradas por seguranca.
            </p>
          </div>

          {view.rows.length > 0 ? (
            <div className="max-h-[32rem] overflow-y-auto overscroll-contain">
              <div className="hidden min-w-full divide-y divide-border/60 md:block">
                {view.rows.map((row) => (
                  <PreviewTableRow key={row.id} row={row} />
                ))}
              </div>

              <div className="divide-y divide-border/60 md:hidden">
                {view.rows.map((row) => (
                  <PreviewCard key={row.id} row={row} />
                ))}
              </div>
            </div>
          ) : (
            <div className="p-5 text-sm font-semibold leading-6 text-muted-foreground">
              Nao encontramos linhas nesta planilha. Envie outro arquivo CSV ou XLSX para a Helena.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
