import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Mail,
  MessageCircle,
  UserRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAdminUserDetail, type AdminRole, type AdminUserDetail } from "@/lib/admin/users";
import { getCurrentUserProfile } from "@/lib/auth/admin";
import { cn } from "@/lib/utils";
import { changeAdminUserRoleAction } from "./actions";

export const dynamic = "force-dynamic";

type DetailParams = {
  userId: string;
};

type DetailSearchParams = Record<string, string | string[] | undefined>;

const countFormatter = new Intl.NumberFormat("pt-BR");
const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
  year: "numeric",
});

function getSingle(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatCount(value: number) {
  return countFormatter.format(value);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Sem registro";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sem registro" : dateTimeFormatter.format(date);
}

function roleBadge(role: AdminRole) {
  return <Badge variant={role === "admin" ? "success" : "secondary"}>{role}</Badge>;
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

function roleErrorMessage(error: string | null) {
  if (!error) {
    return null;
  }

  const messages: Record<string, string> = {
    "invalid-role": "Role invalida.",
    "invalid-user": "Usuario invalido.",
    "missing-confirmation": "Confirme visualmente a alteracao antes de continuar.",
  };

  return messages[error] ?? error;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 py-3 last:border-b-0">
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      <p className="max-w-[60%] text-right text-sm font-extrabold text-foreground">{value}</p>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  tone,
  value,
}: {
  icon: LucideIcon;
  label: string;
  tone: "green" | "red" | "slate";
  value: string;
}) {
  return (
    <Card className="overflow-hidden rounded-[24px]">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
            <p className="mt-3 text-2xl font-extrabold tracking-tight text-foreground">{value}</p>
          </div>
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
              tone === "green" && "bg-primary-soft text-primary",
              tone === "red" && "bg-destructive/10 text-destructive",
              tone === "slate" && "bg-muted text-muted-foreground",
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RoleManagement({
  isSelf,
  user,
}: {
  isSelf: boolean;
  user: AdminUserDetail;
}) {
  const nextRole: AdminRole = user.role === "admin" ? "user" : "admin";
  const isDemotingSelf = isSelf && nextRole === "user";

  return (
    <Card className="overflow-hidden rounded-[26px]">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Permissoes</p>
            <h2 className="mt-2 text-lg font-extrabold tracking-tight text-foreground">Alterar role</h2>
          </div>
          {roleBadge(user.role)}
        </div>

        <p className="text-sm leading-6 text-muted-foreground">
          Esta acao usa a RPC segura <span className="font-bold text-foreground">set_user_role</span> e atualiza apenas a permissao de acesso.
        </p>

        {isDemotingSelf ? (
          <div className="rounded-2xl border border-secondary/20 bg-secondary-soft/60 p-4 text-sm font-semibold leading-6 text-secondary-foreground">
            Para evitar lockout, voce nao pode remover o proprio acesso admin por aqui.
          </div>
        ) : (
          <form action={changeAdminUserRoleAction} className="space-y-4">
            <input name="userId" type="hidden" value={user.id} />
            <input name="newRole" type="hidden" value={nextRole} />
            <label className="flex gap-3 rounded-2xl border border-border/70 bg-background p-4 text-sm font-semibold leading-6 text-muted-foreground">
              <input className="mt-1 h-4 w-4 shrink-0 accent-primary" name="confirmRoleChange" required type="checkbox" value="confirm" />
              <span>
                Confirmo que quero transformar este usuario em <span className="font-extrabold text-foreground">{nextRole}</span>.
              </span>
            </label>
            <Button type="submit" variant={nextRole === "admin" ? "default" : "outline"}>
              {nextRole === "admin" ? "Transformar em admin" : "Transformar em user"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export default async function AdminUsuarioDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<DetailParams>;
  searchParams: Promise<DetailSearchParams>;
}) {
  const [{ userId }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const [detailResult, authState] = await Promise.all([
    getAdminUserDetail(userId),
    getCurrentUserProfile(),
  ]);
  const roleUpdated = getSingle(resolvedSearchParams.roleUpdated);
  const roleError = roleErrorMessage(getSingle(resolvedSearchParams.roleError) ?? null);

  if (detailResult.available && !detailResult.user) {
    notFound();
  }

  if (!detailResult.available || !detailResult.user) {
    return (
      <div className="space-y-6">
        <Button asChild variant="outline">
          <Link href="/admin/usuarios">
            <ArrowLeft className="h-4 w-4" />
            Voltar para usuarios
          </Link>
        </Button>
        <Card className="overflow-hidden rounded-[26px] border-destructive/20 bg-destructive/5">
          <CardContent className="p-5">
            <h1 className="text-xl font-extrabold text-foreground">Nao foi possivel carregar este usuario</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {detailResult.error ?? "Aplique a migration da Fase 4 e tente novamente."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const user = detailResult.user;
  const isSelf = authState.user?.id === user.id;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Button asChild variant="outline">
            <Link href="/admin/usuarios">
              <ArrowLeft className="h-4 w-4" />
              Voltar para usuarios
            </Link>
          </Button>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">Detalhe do usuario</p>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
              {user.fullName ?? "Usuario sem nome"}
            </h1>
            <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Mail className="h-4 w-4" />
              {user.email ?? "E-mail indisponivel"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {roleBadge(user.role)}
          <Badge variant={user.whatsapp.status === "linked" ? "success" : "secondary"}>
            WhatsApp {whatsappLabel(user.whatsapp.status)}
          </Badge>
        </div>
      </div>

      {roleUpdated === "admin" || roleUpdated === "user" ? (
        <div className="rounded-[22px] border border-primary/15 bg-primary-soft/55 p-4 text-sm font-semibold text-primary">
          Role atualizada com sucesso para {roleUpdated}.
        </div>
      ) : null}

      {roleError ? (
        <div className="rounded-[22px] border border-destructive/15 bg-destructive/5 p-4 text-sm font-semibold text-destructive">
          {roleError}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={WalletCards} label="Movimentacoes" tone="slate" value={formatCount(user.metrics.movementsTotal)} />
        <MetricCard icon={WalletCards} label="Entradas" tone="green" value={formatCount(user.metrics.entradasTotal)} />
        <MetricCard icon={WalletCards} label="Despesas" tone="red" value={formatCount(user.metrics.despesasTotal)} />
        <MetricCard icon={MessageCircle} label="Mensagens Helena" tone="green" value={formatCount(user.metrics.helenaMessagesTotal)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <Card className="overflow-hidden rounded-[26px]">
          <CardContent className="p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Perfil</p>
                <h2 className="mt-2 text-lg font-extrabold tracking-tight text-foreground">Dados basicos</h2>
              </div>
              <UserRound className="h-5 w-5 text-primary" />
            </div>
            <InfoRow label="Cadastro" value={formatDateTime(user.createdAt)} />
            <InfoRow label="Atualizado em" value={formatDateTime(user.updatedAt)} />
            <InfoRow label="Ultimo login" value={formatDateTime(user.lastSignInAt)} />
            <InfoRow label="Atividade recente" value={formatDateTime(user.metrics.lastActivityAt)} />
            <InfoRow label="Onboarding" value={user.onboardingCompleted ? "Concluido" : "Pendente"} />
            <InfoRow label="Atuacao" value={user.workType ?? "Nao informado"} />
            <InfoRow label="Tipo de trabalho" value={user.businessMode ?? "Nao informado"} />
            <InfoRow label="Categoria" value={user.mainCategory ?? "Nao informado"} />
            <InfoRow label="Objetivo" value={user.mainGoal ?? "Nao informado"} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="overflow-hidden rounded-[26px]">
            <CardContent className="p-5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">WhatsApp</p>
                  <h2 className="mt-2 text-lg font-extrabold tracking-tight text-foreground">Vinculo Helena</h2>
                </div>
                <MessageCircle className="h-5 w-5 text-primary" />
              </div>
              <InfoRow label="Status" value={whatsappLabel(user.whatsapp.status)} />
              <InfoRow label="Vinculado em" value={formatDateTime(user.whatsapp.linkedAt)} />
              <InfoRow label="Ultima mensagem" value={formatDateTime(user.whatsapp.lastInboundAt)} />
            </CardContent>
          </Card>

          <RoleManagement isSelf={isSelf} user={user} />
        </div>
      </div>

      <Card className="overflow-hidden rounded-[26px]">
        <CardContent className="p-5">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Eventos</p>
              <h2 className="mt-2 text-lg font-extrabold tracking-tight text-foreground">Ultimos registros resumidos</h2>
            </div>
            <CalendarClock className="h-5 w-5 text-primary" />
          </div>

          {user.recentEvents.length ? (
            <div className="space-y-3">
              {user.recentEvents.map((event, index) => (
                <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-background p-4 sm:flex-row sm:items-center sm:justify-between" key={`${event.source}-${event.createdAt}-${index}`}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{event.source}</Badge>
                      <Badge variant={event.kind === "failed" ? "danger" : "success"}>{event.kind}</Badge>
                    </div>
                    <p className="mt-2 text-sm font-extrabold text-foreground">{event.title}</p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-muted-foreground">{event.detail ?? "Sem detalhe adicional"}</p>
                  </div>
                  <p className="shrink-0 text-xs font-bold text-muted-foreground">{formatDateTime(event.createdAt)}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl bg-primary-soft/45 p-4 text-sm font-semibold text-primary">
              <CheckCircle2 className="h-5 w-5" />
              Nenhum evento recente encontrado para este usuario.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
