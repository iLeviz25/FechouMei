import { AlertTriangle, Clock3, Search, ShieldAlert, TerminalSquare } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { getAdminLogs, normalizeAdminLogFilters, type AdminLogEntry, type AdminLogOrigin, type AdminLogSeverity } from "@/lib/admin/logs";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const countFormatter = new Intl.NumberFormat("pt-BR");
const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
});

function formatCount(value: number) {
  return countFormatter.format(value);
}

function formatDate(value: string | null) {
  if (!value) {
    return "Sem registro";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sem registro" : dateFormatter.format(date);
}

function severityVariant(severity: AdminLogSeverity) {
  if (severity === "critical" || severity === "error") {
    return "danger" as const;
  }

  if (severity === "warning") {
    return "warning" as const;
  }

  return "secondary" as const;
}

function originLabel(origin: AdminLogOrigin) {
  const labels: Record<string, string> = {
    admin: "Admin",
    all: "Todas",
    app: "App",
    auth: "Auth",
    helena: "Helena",
    sistema: "Sistema",
    supabase: "Supabase",
    whatsapp: "WhatsApp",
  };

  return labels[origin] ?? origin;
}

function buildPageHref(filters: ReturnType<typeof normalizeAdminLogFilters>, page: number) {
  const params = new URLSearchParams();

  if (filters.query) {
    params.set("q", filters.query);
  }
  if (filters.severity !== "all") {
    params.set("severity", filters.severity);
  }
  if (filters.origin !== "all") {
    params.set("origin", filters.origin);
  }
  if (filters.period !== "7d") {
    params.set("period", filters.period);
  }
  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();
  return query ? `/admin/logs?${query}` : "/admin/logs";
}

function LogCard({ log }: { log: AdminLogEntry }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{originLabel(log.origin)}</Badge>
          <Badge variant={severityVariant(log.severity)}>{log.severity}</Badge>
        </div>
        <p className="text-xs font-bold text-muted-foreground">{formatDate(log.createdAt)}</p>
      </div>
      <p className="mt-3 text-sm font-extrabold text-foreground">{log.message}</p>
      <p className="mt-1 text-xs font-semibold leading-5 text-muted-foreground">
        {log.userName ?? log.userEmail ?? "Sem usuario"} · {log.status}
      </p>
      {log.detail ? (
        <details className="mt-3 rounded-xl bg-muted/45 p-3 text-xs font-semibold leading-5 text-muted-foreground">
          <summary className="cursor-pointer font-extrabold text-foreground">Ver detalhe seguro</summary>
          <p className="mt-2">{log.detail}</p>
        </details>
      ) : null}
    </div>
  );
}

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = normalizeAdminLogFilters(await searchParams);
  const logsResult = await getAdminLogs(filters);
  const hasFilters = Boolean(filters.query || filters.severity !== "all" || filters.origin !== "all" || filters.period !== "7d");

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">Admin FechouMEI</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">Logs e erros</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Monitore falhas, eventos importantes e auditoria administrativa.
            </p>
          </div>
          <Badge className="w-fit" variant={logsResult.available ? "success" : "danger"}>
            {logsResult.available ? `${formatCount(logsResult.total)} eventos` : "Fallback"}
          </Badge>
        </div>
      </div>

      {!logsResult.available ? (
        <Card className="overflow-hidden rounded-[26px] border-destructive/20 bg-destructive/5">
          <CardContent className="flex gap-4 p-5">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
            <p className="text-sm font-semibold leading-6 text-muted-foreground">
              {logsResult.error ?? "Aplique a migration da Fase 5 para carregar logs."}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-[26px]"><CardContent className="p-5"><p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Erros 24h</p><p className="mt-3 text-2xl font-extrabold">{formatCount(logsResult.metrics.errorsLast24Hours)}</p></CardContent></Card>
        <Card className="rounded-[26px]"><CardContent className="p-5"><p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Erros 7 dias</p><p className="mt-3 text-2xl font-extrabold">{formatCount(logsResult.metrics.errorsLast7Days)}</p></CardContent></Card>
        <Card className="rounded-[26px]"><CardContent className="p-5"><p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Criticos</p><p className="mt-3 text-2xl font-extrabold">{formatCount(logsResult.metrics.criticalEvents)}</p></CardContent></Card>
        <Card className="rounded-[26px]"><CardContent className="p-5"><p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Ultimo erro</p><p className="mt-3 truncate text-sm font-extrabold">{logsResult.metrics.latestError ? formatDate(logsResult.metrics.latestError.createdAt) : "Nenhum"}</p></CardContent></Card>
      </div>

      <Card className="overflow-hidden rounded-[26px]">
        <CardContent className="p-4 sm:p-5">
          <form action="/admin/logs" className="grid gap-3 md:grid-cols-[1fr_150px_160px_150px_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" defaultValue={filters.query} name="q" placeholder="Buscar em logs seguros..." />
            </div>
            <Select defaultValue={filters.severity} name="severity">
              <option value="all">Severidade</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
              <option value="critical">Critical</option>
            </Select>
            <Select defaultValue={filters.origin} name="origin">
              <option value="all">Origem</option>
              <option value="helena">Helena</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="admin">Admin</option>
              <option value="app">App</option>
              <option value="sistema">Sistema</option>
            </Select>
            <Select defaultValue={filters.period} name="period">
              <option value="24h">24h</option>
              <option value="7d">7 dias</option>
              <option value="30d">30 dias</option>
            </Select>
            <Button type="submit">Filtrar</Button>
            {hasFilters ? (
              <Button asChild variant="outline"><Link href="/admin/logs">Limpar</Link></Button>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-[26px]">
        <CardContent className="p-5">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Eventos</p>
              <h2 className="mt-2 text-lg font-extrabold tracking-tight text-foreground">Lista de logs</h2>
            </div>
            <TerminalSquare className="h-5 w-5 text-primary" />
          </div>

          {logsResult.logs.length ? (
            <div className="space-y-3">
              {logsResult.logs.map((log) => (
                <LogCard key={log.id} log={log} />
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl bg-primary-soft/45 p-4 text-sm font-semibold text-primary">
              <Clock3 className="h-5 w-5" />
              Nenhum log encontrado para os filtros atuais.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-muted-foreground">
          Pagina {logsResult.page} de {logsResult.totalPages}
        </p>
        <div className="flex gap-2">
          <Button asChild className={cn(logsResult.page <= 1 && "pointer-events-none opacity-50")} variant="outline">
            <Link href={buildPageHref(filters, Math.max(logsResult.page - 1, 1))}>Anterior</Link>
          </Button>
          <Button asChild className={cn(logsResult.page >= logsResult.totalPages && "pointer-events-none opacity-50")} variant="outline">
            <Link href={buildPageHref(filters, Math.min(logsResult.page + 1, logsResult.totalPages))}>Proxima</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
