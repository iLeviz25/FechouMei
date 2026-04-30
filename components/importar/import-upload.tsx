"use client";

import { useMemo, useState, useTransition, type ChangeEvent } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  Upload,
} from "lucide-react";
import { checkImportDuplicates, importMovimentacoes, type ImportActionResult } from "@/app/app/importar/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  detectImportColumns,
  getImportableRows,
  getMissingRequiredColumns,
  hasRequiredColumns,
  markExistingDuplicates,
  normalizeImportRows,
  summarizeImportRows,
} from "@/lib/import/normalize-import-row";
import { parseCsv } from "@/lib/import/parse-csv";
import { parseXlsx } from "@/lib/import/parse-xlsx";
import { cn } from "@/lib/utils";
import type { ImportColumnMap, ImportParseResult, ImportPreviewRow, RawImportRow } from "@/lib/import/types";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency",
});

function toCurrency(value: number) {
  return currencyFormatter.format(value);
}

export function ImportUpload() {
  const [draft, setDraft] = useState<{
    fileName: string;
    headers: string[];
    rawRows: RawImportRow[];
  } | null>(null);
  const [manualMappingOpen, setManualMappingOpen] = useState(false);
  const [mapping, setMapping] = useState<ImportColumnMap>({});
  const [parseResult, setParseResult] = useState<ImportParseResult | null>(null);
  const [feedback, setFeedback] = useState<ImportActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const importableRows = useMemo(() => (parseResult ? getImportableRows(parseResult.rows) : []), [parseResult]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setFeedback(null);
    setParseResult(null);
    setManualMappingOpen(false);

    try {
      const rawRows = await readImportFile(file);
      const headers = getHeaders(rawRows);
      const columnMap = detectImportColumns(headers);

      setDraft({ fileName: file.name, headers, rawRows });
      setMapping(columnMap);

      if (!hasRequiredColumns(columnMap)) {
        setFeedback({
          ok: false,
          message: "Nao identificamos todas as colunas automaticamente. Voce pode mapear manualmente abaixo.",
        });
        setManualMappingOpen(true);
        return;
      }

      processPreview(file.name, rawRows, columnMap);
    } catch (error) {
      setFeedback({
        ok: false,
        message: error instanceof Error ? error.message : "Nao foi possivel ler o arquivo.",
      });
    }
  }

  function processPreview(fileName: string, rawRows: RawImportRow[], columnMap: ImportColumnMap) {
    const normalizedRows = normalizeImportRows(rawRows, columnMap);
    const initialResult = buildParseResult(fileName, columnMap, normalizedRows);
    setManualMappingOpen(false);
    setFeedback(null);
    setParseResult(initialResult);

    const rowsForDuplicateCheck = getImportableRows(initialResult.rows);

    if (rowsForDuplicateCheck.length > 0) {
      startTransition(async () => {
        const result = await checkImportDuplicates(rowsForDuplicateCheck);

        if (!result.ok) {
          setFeedback(result);
          return;
        }

        setParseResult((current) => {
          if (!current) {
            return current;
          }

          const rows = markExistingDuplicates(current.rows, result.duplicateKeys ?? []);
          return buildParseResult(current.fileName, current.columnMap, rows);
        });
      });
    }
  }

  function continueWithManualMapping() {
    if (!draft) {
      return;
    }

    if (!hasRequiredColumns(mapping)) {
      const missing = getMissingRequiredColumns(mapping).join(", ");
      setFeedback({
        ok: false,
        message: `Ainda falta mapear: ${missing}.`,
      });
      return;
    }

    processPreview(draft.fileName, draft.rawRows, mapping);
  }

  function openManualMapping() {
    if (!draft) {
      return;
    }

    setFeedback(null);
    setParseResult(null);
    setManualMappingOpen(true);
  }

  function confirmImport() {
    if (importableRows.length === 0) {
      setFeedback({ ok: false, message: "Nao ha linhas validas para importar." });
      return;
    }

    startTransition(async () => {
      const result = await importMovimentacoes(importableRows);
      setFeedback(result);

      if (result.ok && result.importedCount && result.importedCount > 0) {
        setParseResult(null);
      }
    });
  }

  function resetImport() {
    setDraft(null);
    setFeedback(null);
    setManualMappingOpen(false);
    setMapping({});
    setParseResult(null);
  }

  return (
    <div className="mobile-section-gap">
      <header className="space-y-3">
        <Badge className="w-fit" variant="success">
          <Upload className="mr-1 h-3 w-3" />
          Central de importacao
        </Badge>
        <div className="max-w-2xl space-y-1.5">
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">Importar dados</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Traga movimentacoes de uma planilha ou extrato CSV para continuar de onde parou.
          </p>
        </div>
      </header>

      <Card className="overflow-hidden rounded-[32px]">
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="icon-tile flex h-12 w-12 items-center justify-center rounded-[20px] bg-primary-soft text-primary">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold tracking-tight text-foreground">Envie seu arquivo</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Envie um arquivo CSV ou XLSX com suas entradas e despesas. Voce podera revisar tudo antes de salvar.
                </p>
              </div>
            </div>

            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-card transition-colors hover:bg-primary/92">
              <Upload className="h-4 w-4" />
              Escolher arquivo
              <Input
                accept=".csv,.xlsx"
                className="sr-only"
                disabled={isPending}
                onChange={handleFileChange}
                type="file"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <InfoPill label="Formatos" value="CSV e XLSX" />
            <InfoPill label="Obrigatorio" value="Data, descricao e valor ou credito/debito" />
            <InfoPill label="Seguranca" value="Revisao antes de salvar" />
          </div>

          <div className="rounded-[24px] border border-secondary/20 bg-secondary-soft/70 p-4 text-sm leading-6 text-secondary-foreground">
            Importacao OFX/extrato bancario automatico entrara em uma proxima versao.
          </div>
        </CardContent>
      </Card>

      {feedback ? (
        <p
          className={cn(
            "rounded-[24px] border px-4 py-3 text-sm font-semibold leading-6",
            feedback.ok ? "border-success/20 bg-success/10 text-success" : "border-destructive/20 bg-destructive/10 text-destructive",
          )}
          role="status"
        >
          {feedback.message}
          {feedback.ok && feedback.skippedDuplicateCount ? ` ${feedback.skippedDuplicateCount} duplicada(s) ignorada(s).` : ""}
        </p>
      ) : null}

      {manualMappingOpen && draft ? (
        <ManualMappingCard
          headers={draft.headers}
          isPending={isPending}
          mapping={mapping}
          onChange={setMapping}
          onContinue={continueWithManualMapping}
        />
      ) : null}

      {parseResult ? (
        <ImportPreview
          isPending={isPending}
          onAdjustMapping={draft ? openManualMapping : undefined}
          onConfirm={confirmImport}
          onReset={resetImport}
          result={parseResult}
        />
      ) : null}

      {feedback?.ok && !parseResult ? (
        <Card className="overflow-hidden rounded-[30px]">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-base font-extrabold text-foreground">Importacao concluida</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Confira os registros importados em Movimentacoes ou envie outro arquivo.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href="/app/movimentacoes">Ver movimentacoes</Link>
              </Button>
              <Button onClick={resetImport} type="button">
                Importar outro
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function ImportPreview({
  isPending,
  onAdjustMapping,
  onConfirm,
  onReset,
  result,
}: {
  isPending: boolean;
  onAdjustMapping?: () => void;
  onConfirm: () => void;
  onReset: () => void;
  result: ImportParseResult;
}) {
  const summary = result.summary;

  return (
    <section className="space-y-4">
      <Card className="overflow-hidden rounded-[32px]">
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Previa da importacao</p>
              <h2 className="mt-1 text-xl font-extrabold tracking-tight text-foreground">{result.fileName}</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Conferimos colunas, valores e duplicados antes de salvar no app.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {onAdjustMapping ? (
                <Button onClick={onAdjustMapping} size="sm" type="button" variant="outline">
                  Ajustar mapeamento
                </Button>
              ) : null}
              <Badge variant={summary.importableCount > 0 ? "success" : "secondary"}>
                {summary.importableCount} para importar
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryBox label="Linhas" value={String(summary.totalRows)} />
            <SummaryBox label="Com erro" tone="danger" value={String(summary.errorCount)} />
            <SummaryBox label="Duplicadas" tone="warning" value={String(summary.duplicateFileCount + summary.duplicateExistingCount)} />
            <SummaryBox label="Validas" tone="success" value={String(summary.importableCount)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <AmountBox
              icon={ArrowDownLeft}
              label={`${summary.incomeCount} entradas`}
              tone="success"
              value={toCurrency(summary.incomeAmount)}
            />
            <AmountBox
              icon={ArrowUpRight}
              label={`${summary.expenseCount} despesas`}
              tone="danger"
              value={toCurrency(summary.expenseAmount)}
            />
          </div>

          <div className="rounded-[24px] border border-border/70 bg-muted/30 p-4">
            <p className="text-sm font-bold text-foreground">Colunas detectadas</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <ColumnBadge label="Data" value={result.columnMap.date} />
              <ColumnBadge label="Descricao" value={result.columnMap.description} />
              <ColumnBadge label="Valor" value={result.columnMap.amount ?? "Credito/Debito"} />
              <ColumnBadge label="Credito" value={result.columnMap.credit} />
              <ColumnBadge label="Debito" value={result.columnMap.debit} />
              <ColumnBadge label="Tipo" value={result.columnMap.type ?? "Inferido"} />
              <ColumnBadge label="Categoria" value={result.columnMap.category ?? "Sugerida"} />
              <ColumnBadge label="Observacao" value={result.columnMap.notes ?? "Ignorada"} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-[32px]">
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-border/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-foreground">Movimentacoes detectadas</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Linhas com erro ou duplicadas serao ignoradas por seguranca.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={isPending} onClick={onReset} type="button" variant="outline">
                <RotateCcw className="h-4 w-4" />
                Trocar arquivo
              </Button>
              <Button disabled={isPending || summary.importableCount === 0} onClick={onConfirm} type="button">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Importar movimentacoes
              </Button>
            </div>
          </div>

          <div className="max-h-[32rem] overflow-y-auto overscroll-contain">
            <div className="hidden min-w-full divide-y divide-border/60 md:block">
              {result.rows.map((row) => (
                <PreviewTableRow key={row.id} row={row} />
              ))}
            </div>

            <div className="divide-y divide-border/60 md:hidden">
              {result.rows.map((row) => (
                <PreviewCard key={row.id} row={row} />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function ManualMappingCard({
  headers,
  isPending,
  mapping,
  onChange,
  onContinue,
}: {
  headers: string[];
  isPending: boolean;
  mapping: ImportColumnMap;
  onChange: (mapping: ImportColumnMap) => void;
  onContinue: () => void;
}) {
  function updateMapping(key: keyof ImportColumnMap, value: string) {
    onChange({
      ...mapping,
      [key]: value || undefined,
    });
  }

  return (
    <Card className="overflow-hidden rounded-[32px] border-secondary/30">
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="space-y-1">
          <Badge className="w-fit" variant="secondary">
            Mapeamento manual
          </Badge>
          <h2 className="text-xl font-extrabold tracking-tight text-foreground">Diga o que cada coluna representa</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Preenchi o que consegui detectar. Ajuste os campos abaixo e continue para ver a previa.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <MappingSelect headers={headers} label="Data" required value={mapping.date} onChange={(value) => updateMapping("date", value)} />
          <MappingSelect
            headers={headers}
            label="Descricao"
            required
            value={mapping.description}
            onChange={(value) => updateMapping("description", value)}
          />
          <MappingSelect headers={headers} label="Valor total" value={mapping.amount} onChange={(value) => updateMapping("amount", value)} />
          <MappingSelect headers={headers} label="Tipo" value={mapping.type} onChange={(value) => updateMapping("type", value)} />
          <MappingSelect headers={headers} label="Credito" value={mapping.credit} onChange={(value) => updateMapping("credit", value)} />
          <MappingSelect headers={headers} label="Debito" value={mapping.debit} onChange={(value) => updateMapping("debit", value)} />
          <MappingSelect headers={headers} label="Categoria" value={mapping.category} onChange={(value) => updateMapping("category", value)} />
          <MappingSelect headers={headers} label="Observacao" value={mapping.notes} onChange={(value) => updateMapping("notes", value)} />
        </div>

        <div className="rounded-[24px] border border-border/70 bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
          Para continuar, informe Data, Descricao e Valor total ou use as colunas Credito/Debito.
        </div>

        <Button disabled={isPending} onClick={onContinue} type="button">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Continuar previa
        </Button>
      </CardContent>
    </Card>
  );
}

function MappingSelect({
  headers,
  label,
  onChange,
  required = false,
  value,
}: {
  headers: string[];
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
  value?: string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
        {required ? " *" : ""}
      </span>
      <Select onChange={(event) => onChange(event.target.value)} value={value ?? ""}>
        <option value="">Nao usar</option>
        {headers.map((header) => (
          <option key={header} value={header}>
            {header}
          </option>
        ))}
      </Select>
    </label>
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
    </div>
  );
}

function RowStatus({ row }: { row: ImportPreviewRow }) {
  const label =
    row.status === "valid"
      ? "Valida"
      : row.status === "duplicate_file"
        ? "Duplicada no arquivo"
        : row.status === "duplicate_existing"
          ? "Duplicada no app"
          : "Com erro";

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
      {label}
    </span>
  );
}

function SummaryBox({ label, tone = "neutral", value }: { label: string; tone?: "danger" | "neutral" | "success" | "warning"; value: string }) {
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
      <div className={cn("icon-tile flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl", tone === "success" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive")}>
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

function ColumnBadge({ label, value }: { label: string; value?: string }) {
  return (
    <span className="rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground">
      <span className="text-foreground">{label}:</span> {value ?? "Nao encontrada"}
    </span>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-border/70 bg-muted/30 p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

async function readImportFile(file: File): Promise<RawImportRow[]> {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "csv") {
    return parseCsv(await file.text());
  }

  if (extension === "xlsx") {
    return parseXlsx(await file.arrayBuffer());
  }

  throw new Error("Formato nao suportado. Envie um arquivo CSV ou XLSX.");
}

function getHeaders(rows: RawImportRow[]) {
  const headers = new Set<string>();
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => headers.add(key));
  });
  return Array.from(headers);
}

function buildParseResult(fileName: string, columnMap: ImportColumnMap, rows: ImportPreviewRow[]): ImportParseResult {
  return {
    columnMap,
    fileName,
    rows,
    summary: summarizeImportRows(rows),
  };
}
