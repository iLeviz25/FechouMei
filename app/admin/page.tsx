import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Database,
  MessageCircle,
  ShieldCheck,
  TrendingUp,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  getAdminOverviewMetrics,
  type AdminOverviewMetrics,
  type RecentAdminErrorEvent,
  type RecentAdminMovement,
  type RecentAdminUser,
} from "@/lib/admin/overview";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const countFormatter = new Intl.NumberFormat("pt-BR");
const percentFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});
const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency",
});
const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
});

type Tone = "green" | "red" | "amber" | "slate";

const toneClasses: Record<Tone, string> = {
  amber: "bg-secondary-soft text-secondary-foreground",
  green: "bg-primary-soft text-primary",
  red: "bg-destructive/10 text-destructive",
  slate: "bg-muted text-muted-foreground",
};

function formatCount(value: number | null) {
  return value === null ? "—" : countFormatter.format(value);
}

function formatPercent(value: number | null) {
  return value === null ? "—" : `${percentFormatter.format(value)}%`;
}

function formatCurrency(value: number | null) {
  return value === null ? "—" : currencyFormatter.format(value);
}

function formatDate(value: string | null) {
  if (!value) {
    return "Sem data";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sem data" : dateFormatter.format(date);
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    active: "Ativo",
    available: "Disponivel",
    connected: "Conectado",
    unavailable: "Indisponivel",
  };

  return labels[value] ?? value;
}

function metricDetail(available: boolean, detail: string, reason?: string) {
  return available ? detail : reason ?? "Metrica indisponivel no momento.";
}

function OverviewCard({
  available,
  detail,
  icon: Icon,
  label,
  tone,
  value,
}: {
  available: boolean;
  detail: string;
  icon: LucideIcon;
  label: string;
  tone: Tone;
  value: string;
}) {
  return (
    <Card className="overflow-hidden rounded-[26px]">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
            <p className="mt-3 text-2xl font-extrabold tracking-tight text-foreground">{value}</p>
          </div>
          <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", toneClasses[tone])}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-4 flex items-start gap-2 text-xs font-semibold leading-5 text-muted-foreground">
          {available ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          ) : (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          )}
          <span>{detail}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function RoleSummary({ metrics }: { metrics: AdminOverviewMetrics }) {
  const total = (metrics.roles.user ?? 0) + (metrics.roles.admin ?? 0);
  const adminPercent = total > 0 && metrics.roles.admin !== null ? Math.round((metrics.roles.admin / total) * 100) : 0;

  return (
    <Card className="overflow-hidden rounded-[26px]">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Contas por role</p>
            <h2 className="mt-2 text-lg font-extrabold tracking-tight text-foreground">Permissoes ativas</h2>
          </div>
          <Badge variant={metrics.roles.available ? "success" : "danger"}>
            {metrics.roles.available ? "Real" : "Indisponivel"}
          </Badge>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between text-sm font-bold">
              <span>User</span>
              <span>{formatCount(metrics.roles.user)}</span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-primary" style={{ width: total > 0 ? `${100 - adminPercent}%` : "0%" }} />
            </div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between text-sm font-bold">
              <span>Admin</span>
              <span>{formatCount(metrics.roles.admin)}</span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-secondary" style={{ width: total > 0 ? `${adminPercent}%` : "0%" }} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RecentUsersList({ users }: { users: RecentAdminUser[] }) {
  if (!users.length) {
    return <p className="rounded-2xl bg-muted/50 p-4 text-sm text-muted-foreground">Nenhum usuario recente.</p>;
  }

  return (
    <div className="space-y-3">
      {users.map((user) => (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background p-3" key={user.id}>
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold text-foreground">{user.fullName ?? "Usuario sem nome"}</p>
            <p className="text-xs font-semibold text-muted-foreground">{formatDate(user.createdAt)}</p>
          </div>
          <Badge variant={user.role === "admin" ? "success" : "secondary"}>{user.role}</Badge>
        </div>
      ))}
    </div>
  );
}

function RecentMovementsList({ movements }: { movements: RecentAdminMovement[] }) {
  if (!movements.length) {
    return <p className="rounded-2xl bg-muted/50 p-4 text-sm text-muted-foreground">Nenhuma movimentacao recente.</p>;
  }

  return (
    <div className="space-y-3">
      {movements.map((movement) => {
        const isIncome = movement.type === "entrada";

        return (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background p-3" key={movement.id}>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    isIncome ? "bg-primary" : "bg-destructive",
                  )}
                />
                <p className="truncate text-sm font-extrabold text-foreground">{movement.description}</p>
              </div>
              <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">
                {movement.category} · {movement.userName ?? "Usuario"} · {formatDate(movement.occurredOn)}
              </p>
            </div>
            <p className={cn("shrink-0 text-sm font-extrabold", isIncome ? "text-primary" : "text-destructive")}>
              {isIncome ? "+" : "-"} {formatCurrency(movement.amount)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function RecentErrorsList({ events }: { events: RecentAdminErrorEvent[] }) {
  if (!events.length) {
    return <p className="rounded-2xl bg-primary-soft/40 p-4 text-sm font-semibold text-primary">Nenhum evento critico recente.</p>;
  }

  return (
    <div className="space-y-3">
      {events.map((event, index) => (
        <div className="rounded-2xl border border-destructive/15 bg-destructive/5 p-3" key={`${event.source}-${event.createdAt}-${index}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-extrabold text-foreground">{event.source}</p>
            <span className="text-xs font-bold text-destructive">{formatDate(event.createdAt)}</span>
          </div>
          <p className="mt-1 text-sm font-bold text-foreground">{event.title}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{event.detail ?? event.status}</p>
        </div>
      ))}
    </div>
  );
}

function HealthSection({ metrics }: { metrics: AdminOverviewMetrics }) {
  const items = [
    { icon: Database, label: "Banco conectado", value: statusLabel(metrics.health.database) },
    { icon: ShieldCheck, label: "Admin ativo", value: statusLabel(metrics.health.admin) },
    { icon: MessageCircle, label: "WhatsApp / Helena", value: statusLabel(metrics.health.whatsapp) },
    { icon: Activity, label: "Logs operacionais", value: statusLabel(metrics.health.logs) },
  ];

  return (
    <Card className="overflow-hidden rounded-[26px]">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Saude do sistema</p>
            <h2 className="mt-2 text-lg font-extrabold tracking-tight text-foreground">Status basico</h2>
          </div>
          <Badge variant={metrics.health.available ? "success" : "danger"}>
            {metrics.health.available ? "OK" : "Atencao"}
          </Badge>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {items.map((item) => {
            const Icon = item.icon;

            return (
              <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background p-3" key={item.label}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-extrabold text-foreground">{item.value}</p>
                  <p className="text-xs font-semibold text-muted-foreground">{item.label}</p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function AdminPage() {
  const metrics = await getAdminOverviewMetrics();

  const overviewCards = [
    {
      available: metrics.users.available,
      detail: metricDetail(
        metrics.users.available,
        `${formatCount(metrics.users.createdLast7Days)} em 7 dias · ${formatCount(metrics.users.createdLast30Days)} em 30 dias`,
        metrics.users.reason,
      ),
      icon: UsersRound,
      label: "Usuarios cadastrados",
      tone: "green" as const,
      value: formatCount(metrics.users.total),
    },
    {
      available: metrics.whatsapp.available,
      detail: metricDetail(
        metrics.whatsapp.available,
        `${formatCount(metrics.whatsapp.linkedUsers)} vinculados · ${formatCount(metrics.whatsapp.unlinkedUsers)} sem vinculo`,
        metrics.whatsapp.reason,
      ),
      icon: MessageCircle,
      label: "WhatsApp vinculado",
      tone: "green" as const,
      value: formatPercent(metrics.whatsapp.activationPercentage),
    },
    {
      available: metrics.movements.available,
      detail: metricDetail(
        metrics.movements.available,
        `${formatCount(metrics.movements.entradas)} entradas · ${formatCount(metrics.movements.despesas)} despesas · ${formatCount(metrics.movements.createdLast7Days)} em 7 dias`,
        metrics.movements.reason,
      ),
      icon: WalletCards,
      label: "Movimentacoes",
      tone: "amber" as const,
      value: formatCount(metrics.movements.total),
    },
    {
      available: metrics.errors.available,
      detail: metricDetail(
        metrics.errors.available,
        (metrics.errors.recentTotal ?? 0) > 0
          ? "Eventos falhos nos ultimos 7 dias"
          : "Nenhum erro recente nos ultimos 7 dias",
        metrics.errors.reason,
      ),
      icon: AlertTriangle,
      label: "Erros recentes",
      tone: (metrics.errors.recentTotal ?? 0) > 0 ? ("red" as const) : ("slate" as const),
      value: formatCount(metrics.errors.recentTotal),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">Admin FechouMEI</p>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">Visao geral</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Acompanhe a saude geral do FechouMEI.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {overviewCards.map((card) => (
          <OverviewCard {...card} key={card.label} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <RoleSummary metrics={metrics} />

        <Card className="overflow-hidden rounded-[26px]">
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Helena</p>
                <h2 className="mt-2 text-lg font-extrabold tracking-tight text-foreground">Mensagens registradas</h2>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                <Bot className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-background p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Total</p>
                <p className="mt-2 text-2xl font-extrabold text-foreground">{formatCount(metrics.helena.messagesTotal)}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Ultimos 7 dias</p>
                <p className="mt-2 text-2xl font-extrabold text-foreground">{formatCount(metrics.helena.messagesLast7Days)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden rounded-[26px]">
          <CardContent className="p-5">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Atividade recente</p>
                <h2 className="mt-2 text-lg font-extrabold tracking-tight text-foreground">Usuarios criados</h2>
              </div>
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <RecentUsersList users={metrics.users.recent} />
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-[26px]">
          <CardContent className="p-5">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Sistema</p>
                <h2 className="mt-2 text-lg font-extrabold tracking-tight text-foreground">Ultimas movimentacoes</h2>
              </div>
              <WalletCards className="h-5 w-5 text-primary" />
            </div>
            <RecentMovementsList movements={metrics.movements.recent} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <HealthSection metrics={metrics} />

        <Card className="overflow-hidden rounded-[26px]">
          <CardContent className="p-5">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Erros recentes</p>
                <h2 className="mt-2 text-lg font-extrabold tracking-tight text-foreground">Eventos criticos</h2>
              </div>
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <RecentErrorsList events={metrics.errors.recent} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
