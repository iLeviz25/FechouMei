import { AlertTriangle, Bot, CheckCircle2, MessageCircle, Phone, UsersRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { AdminHelenaActivityPanel } from "@/components/admin/admin-helena-activity-panel";
import { AdminHelenaPromptsPanel } from "@/components/admin/admin-helena-prompts-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAdminHelenaDashboard, getAdminHelenaPrompts, type AdminHelenaConnection, type AdminHelenaEvent } from "@/lib/admin/helena";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

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

function whatsappLabel(status: string) {
  const labels: Record<string, string> = {
    expired: "Expirado",
    linked: "Vinculado",
    none: "Nao vinculado",
    pending: "Pendente",
    revoked: "Revogado",
  };

  return labels[status] ?? status;
}

function MetricCard({
  detail,
  icon: Icon,
  label,
  tone,
  value,
}: {
  detail: string;
  icon: LucideIcon;
  label: string;
  tone: "green" | "red" | "slate";
  value: string;
}) {
  return (
    <Card className="overflow-hidden rounded-[26px]">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
            <p className="mt-3 text-2xl font-extrabold tracking-tight text-foreground">{value}</p>
          </div>
          <div
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
              tone === "green" && "bg-primary-soft text-primary",
              tone === "red" && "bg-destructive/10 text-destructive",
              tone === "slate" && "bg-muted text-muted-foreground",
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <p className="mt-4 text-xs font-semibold leading-5 text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function ConnectionMobileCard({ connection }: { connection: AdminHelenaConnection }) {
  return (
    <Card className="overflow-hidden rounded-[24px] lg:hidden">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold text-foreground">{connection.fullName ?? "Usuario sem nome"}</p>
            <p className="truncate text-xs font-semibold text-muted-foreground">{connection.email ?? "E-mail indisponivel"}</p>
          </div>
          <Badge variant={connection.whatsappStatus === "linked" ? "success" : "secondary"}>
            {whatsappLabel(connection.whatsappStatus)}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-muted-foreground">
          <div className="rounded-2xl bg-muted/50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em]">Telefone</p>
            <p className="mt-2 text-foreground">{connection.maskedPhone ?? "Nao informado"}</p>
          </div>
          <div className="rounded-2xl bg-muted/50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em]">Atividade</p>
            <p className="mt-2 text-foreground">{formatDate(connection.lastActivityAt)}</p>
          </div>
          <div className="rounded-2xl bg-muted/50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em]">Mensagens</p>
            <p className="mt-2 text-foreground">{formatCount(connection.messagesCount)}</p>
          </div>
          <div className="rounded-2xl bg-muted/50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em]">Erros</p>
            <p className="mt-2 text-foreground">{formatCount(connection.errorsCount)}</p>
          </div>
        </div>
        <Button asChild className="w-full" variant="outline">
          <Link href={`/admin/usuarios/${connection.userId}`}>Ver usuario</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function RecentEvents({ events }: { events: AdminHelenaEvent[] }) {
  if (!events.length) {
    return (
      <div className="rounded-2xl bg-primary-soft/45 p-4 text-sm font-semibold text-primary">
        Nenhum evento recente encontrado para a Helena.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((event, index) => (
        <div className="rounded-2xl border border-border/70 bg-background p-4" key={`${event.source}-${event.createdAt}-${index}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{event.source}</Badge>
              <Badge variant={event.result === "error" ? "danger" : "success"}>
                {event.result === "error" ? "Erro" : "Sucesso"}
              </Badge>
            </div>
            <p className="text-xs font-bold text-muted-foreground">{formatDate(event.createdAt)}</p>
          </div>
          <p className="mt-3 text-sm font-extrabold text-foreground">{event.eventType}</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-muted-foreground">
            {event.userName ?? event.email ?? "Usuario nao identificado"} · {event.summary ?? event.status}
          </p>
        </div>
      ))}
    </div>
  );
}

export default async function AdminHelenaPage() {
  const [dashboard, prompts] = await Promise.all([
    getAdminHelenaDashboard(),
    getAdminHelenaPrompts(),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">Admin FechouMEI</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">Helena / WhatsApp</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Acompanhe conexoes, mensagens e sinais operacionais da Helena.
            </p>
          </div>
          <Badge className="w-fit" variant={dashboard.available ? "success" : "danger"}>
            {dashboard.available ? "Dados reais" : "Fallback"}
          </Badge>
        </div>
      </div>

      {!dashboard.available ? (
        <Card className="overflow-hidden rounded-[26px] border-destructive/20 bg-destructive/5">
          <CardContent className="flex gap-4 p-5">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
            <p className="text-sm font-semibold leading-6 text-muted-foreground">
              {dashboard.error ?? "Aplique a migration da Fase 5 para carregar os dados operacionais."}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard detail="Usuarios com status linked." icon={Phone} label="WhatsApp vinculado" tone="green" value={formatCount(dashboard.stats.linkedUsers)} />
        <MetricCard detail="Usuarios sem vinculo ativo." icon={UsersRound} label="Sem WhatsApp" tone="slate" value={formatCount(dashboard.stats.unlinkedUsers)} />
        <MetricCard detail="Mensagens registradas nas tabelas da Helena." icon={MessageCircle} label="Mensagens Helena" tone="green" value={formatCount(dashboard.stats.totalMessages)} />
        <MetricCard detail="Falhas nos ultimos 7 dias." icon={AlertTriangle} label="Erros recentes" tone={dashboard.stats.recentErrors > 0 ? "red" : "slate"} value={formatCount(dashboard.stats.recentErrors)} />
      </div>

      <Card className="overflow-hidden rounded-[26px]">
        <CardContent className="p-5">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Conexoes</p>
              <h2 className="mt-2 text-lg font-extrabold tracking-tight text-foreground">Usuarios e WhatsApp</h2>
            </div>
            <Bot className="h-5 w-5 text-primary" />
          </div>

          {dashboard.connections.length ? (
            <>
              <div className="space-y-3 lg:hidden">
                {dashboard.connections.map((connection) => (
                  <ConnectionMobileCard connection={connection} key={connection.userId} />
                ))}
              </div>

              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[980px] text-left">
                  <thead className="border-b border-border/70 bg-muted/45 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Usuario</th>
                      <th className="px-4 py-3">WhatsApp</th>
                      <th className="px-4 py-3">Vinculo</th>
                      <th className="px-4 py-3">Ultima atividade</th>
                      <th className="px-4 py-3">Uso</th>
                      <th className="px-4 py-3 text-right">Acao</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {dashboard.connections.map((connection) => (
                      <tr className="bg-card transition-colors hover:bg-muted/30" key={connection.userId}>
                        <td className="px-4 py-4">
                          <p className="text-sm font-extrabold text-foreground">{connection.fullName ?? "Usuario sem nome"}</p>
                          <p className="mt-1 text-xs font-semibold text-muted-foreground">{connection.email ?? "E-mail indisponivel"}</p>
                        </td>
                        <td className="px-4 py-4">
                          <Badge variant={connection.whatsappStatus === "linked" ? "success" : "secondary"}>
                            {whatsappLabel(connection.whatsappStatus)}
                          </Badge>
                          <p className="mt-1 text-xs font-semibold text-muted-foreground">{connection.maskedPhone ?? "Telefone oculto"}</p>
                        </td>
                        <td className="px-4 py-4 text-sm font-semibold text-muted-foreground">{formatDate(connection.linkedAt)}</td>
                        <td className="px-4 py-4 text-sm font-semibold text-muted-foreground">{formatDate(connection.lastActivityAt)}</td>
                        <td className="px-4 py-4 text-xs font-semibold text-muted-foreground">
                          {formatCount(connection.messagesCount)} mensagens · {formatCount(connection.errorsCount)} erros
                        </td>
                        <td className="px-4 py-4 text-right">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/admin/usuarios/${connection.userId}`}>Ver usuario</Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl bg-primary-soft/45 p-4 text-sm font-semibold text-primary">
              <CheckCircle2 className="h-5 w-5" />
              Nenhuma conexao encontrada ainda.
            </div>
          )}
        </CardContent>
      </Card>

      <AdminHelenaActivityPanel events={dashboard.events} />

      <AdminHelenaPromptsPanel
        available={prompts.available}
        error={prompts.error}
        templates={prompts.templates}
        traces={prompts.traces}
      />
    </div>
  );
}
