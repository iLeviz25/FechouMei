"use client";

import { useMemo, useState } from "react";
import { Clipboard, Copy, FileText, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { AdminHelenaPromptTrace } from "@/lib/admin/helena";
import type { AgentPromptTemplate } from "@/lib/agent/gemini";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
});

function formatDate(value: string | null) {
  if (!value) {
    return "Sem registro";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sem registro" : dateFormatter.format(date);
}

function includesText(value: string | null | undefined, query: string) {
  return (value ?? "").toLowerCase().includes(query);
}

function PromptCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button onClick={copyPrompt} size="sm" type="button" variant="outline">
      <Copy className="h-4 w-4" />
      {copied ? "Copiado" : "Copiar"}
    </Button>
  );
}

export function AdminHelenaPromptsPanel({
  available,
  error,
  templates,
  traces,
}: {
  available: boolean;
  error: string | null;
  templates: AgentPromptTemplate[];
  traces: AdminHelenaPromptTrace[];
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "error" | "success" | "skipped">("all");
  const [type, setType] = useState("all");
  const normalizedQuery = query.trim().toLowerCase();
  const traceTypes = useMemo(() => [...new Set(traces.map((trace) => trace.traceType))].sort(), [traces]);
  const filteredTraces = useMemo(
    () =>
      traces.filter((trace) => {
        const matchesStatus = status === "all" || trace.status === status;
        const matchesType = type === "all" || trace.traceType === type;
        const matchesText =
          !normalizedQuery ||
          includesText(trace.promptPreview, normalizedQuery) ||
          includesText(trace.userMessagePreview, normalizedQuery) ||
          includesText(trace.responsePreview, normalizedQuery) ||
          includesText(trace.actionName, normalizedQuery) ||
          includesText(trace.userName, normalizedQuery) ||
          includesText(trace.userEmail, normalizedQuery);

        return matchesStatus && matchesType && matchesText;
      }),
    [normalizedQuery, status, traces, type],
  );

  return (
    <Card className="overflow-hidden rounded-[26px]">
      <CardContent className="space-y-6 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
              Prompts da Helena
            </p>
            <h2 className="mt-2 text-lg font-extrabold tracking-tight text-foreground">
              Templates e execucoes recentes
            </h2>
            <p className="mt-1 max-w-2xl text-xs font-semibold leading-5 text-muted-foreground">
              Visualizacao operacional para debug. Conteudos sao sanitizados e truncados antes de aparecer aqui.
            </p>
          </div>
          <FileText className="hidden h-5 w-5 text-primary lg:block" />
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-extrabold text-foreground">Prompts/templates atuais</h3>
            <Badge variant="secondary">{templates.length} templates</Badge>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {templates.map((template) => (
              <div className="rounded-2xl border border-border/70 bg-background p-4" key={template.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-extrabold text-foreground">{template.title}</p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-muted-foreground">
                      {template.description}
                    </p>
                  </div>
                  <PromptCopyButton text={template.promptText} />
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-extrabold text-primary">Ver template</summary>
                  <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl bg-muted/60 p-3 text-xs leading-5 text-foreground">
                    {template.promptText}
                  </pre>
                </details>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-sm font-extrabold text-foreground">Prompts executados recentemente</h3>
              <p className="mt-1 text-xs font-semibold text-muted-foreground">
                {filteredTraces.length} de {traces.length} traces carregados.
              </p>
            </div>
            <Badge className="w-fit" variant={available ? "success" : "danger"}>
              {available ? "Traces conectados" : "Traces indisponiveis"}
            </Badge>
          </div>

          {!available ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm font-semibold text-destructive">
              {error ?? "Aplique a migration da Fase 5.1 para registrar prompts recentes."}
            </div>
          ) : null}

          <div className="grid gap-2 lg:grid-cols-[1fr_150px_170px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar prompt..."
                value={query}
              />
            </label>
            <select
              className="h-11 rounded-xl border border-input bg-background px-3 text-sm font-bold text-foreground shadow-sm"
              onChange={(event) => setStatus(event.target.value as "all" | "error" | "success" | "skipped")}
              value={status}
            >
              <option value="all">Todos</option>
              <option value="success">Sucesso</option>
              <option value="error">Erro</option>
              <option value="skipped">Ignorado</option>
            </select>
            <select
              className="h-11 rounded-xl border border-input bg-background px-3 text-sm font-bold text-foreground shadow-sm"
              onChange={(event) => setType(event.target.value)}
              value={type}
            >
              <option value="all">Todos os tipos</option>
              {traceTypes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="max-h-[620px] space-y-3 overflow-y-auto pr-1">
            {filteredTraces.length ? (
              filteredTraces.map((trace) => (
                <div className="rounded-2xl border border-border/70 bg-background p-4" key={trace.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{trace.channel}</Badge>
                      <Badge variant={trace.status === "error" ? "danger" : "success"}>{trace.status}</Badge>
                      <Badge variant="outline">{trace.traceType}</Badge>
                    </div>
                    <p className="text-xs font-bold text-muted-foreground">{formatDate(trace.createdAt)}</p>
                  </div>

                  <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold text-foreground">
                        {trace.actionName ?? "Sem acao detectada"}
                      </p>
                      <p className="mt-1 text-xs font-semibold leading-5 text-muted-foreground">
                        {trace.userName ?? trace.userEmail ?? "Usuario nao identificado"} · {trace.model ?? "modelo nao informado"}
                      </p>
                    </div>
                    {trace.promptText ? <PromptCopyButton text={trace.promptText} /> : null}
                  </div>

                  <p className="mt-3 text-xs font-semibold leading-5 text-muted-foreground">
                    <span className="font-extrabold text-foreground">Mensagem:</span>{" "}
                    {trace.userMessagePreview ?? "Sem preview"}
                  </p>
                  <p className="mt-2 text-xs font-semibold leading-5 text-muted-foreground">
                    <span className="font-extrabold text-foreground">Resposta:</span>{" "}
                    {trace.responsePreview ?? "Sem preview"}
                  </p>

                  {trace.promptText ? (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-extrabold text-primary">
                        Expandir prompt
                      </summary>
                      <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-2xl bg-muted/60 p-3 text-xs leading-5 text-foreground">
                        {trace.promptText}
                      </pre>
                    </details>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="rounded-2xl bg-primary-soft/45 p-4 text-sm font-semibold text-primary">
                Nenhum prompt encontrado com esses filtros.
              </div>
            )}
          </div>
        </section>

        <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/40 p-4 text-xs font-semibold leading-5 text-muted-foreground">
          <Clipboard className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          Os traces comecam a aparecer para novas conversas depois que a migration da Fase 5.1 estiver aplicada.
        </div>
      </CardContent>
    </Card>
  );
}
