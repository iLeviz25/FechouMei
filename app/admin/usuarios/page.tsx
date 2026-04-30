import {
  ArrowLeft,
  ArrowRight,
  Mail,
  MessageCircle,
  Search,
  UserRound,
  UsersRound,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  listAdminUsers,
  normalizeAdminUserFilters,
  type AdminRole,
  type AdminSubscriptionPlan,
  type AdminSubscriptionStatus,
  type AdminUserListItem,
} from "@/lib/admin/users";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const countFormatter = new Intl.NumberFormat("pt-BR");
const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
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

function roleBadge(role: AdminRole) {
  return <Badge variant={role === "admin" ? "success" : "secondary"}>{role}</Badge>;
}

function planBadge(plan: AdminSubscriptionPlan) {
  return <Badge variant={plan === "pro" ? "success" : "secondary"}>{plan === "pro" ? "Pro" : "Essencial"}</Badge>;
}

function subscriptionStatusBadge(status: AdminSubscriptionStatus) {
  const labels: Record<AdminSubscriptionStatus, string> = {
    active: "Ativa",
    canceled: "Cancelada",
    past_due: "Pendente",
    pending_payment: "Aguardando",
  };

  const variant = status === "active" ? "success" : status === "pending_payment" ? "secondary" : "danger";

  return <Badge variant={variant}>{labels[status]}</Badge>;
}

function whatsappBadge(status: string) {
  const isLinked = status === "linked";

  return (
    <Badge variant={isLinked ? "success" : "secondary"}>
      {isLinked ? "Vinculado" : "Nao vinculado"}
    </Badge>
  );
}

function buildPageHref(filters: ReturnType<typeof normalizeAdminUserFilters>, page: number) {
  const params = new URLSearchParams();

  if (filters.query) {
    params.set("q", filters.query);
  }

  if (filters.role !== "all") {
    params.set("role", filters.role);
  }

  if (filters.whatsapp !== "all") {
    params.set("whatsapp", filters.whatsapp);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();
  return query ? `/admin/usuarios?${query}` : "/admin/usuarios";
}

function UserMobileCard({ user }: { user: AdminUserListItem }) {
  return (
    <Card className="overflow-hidden rounded-[24px] lg:hidden">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold text-foreground">{user.fullName ?? "Usuario sem nome"}</p>
            <p className="mt-1 flex items-center gap-1.5 truncate text-xs font-semibold text-muted-foreground">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              {user.email ?? "E-mail indisponivel"}
            </p>
          </div>
          {roleBadge(user.role)}
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-muted-foreground">
          <div className="rounded-2xl bg-muted/50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em]">Assinatura</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {planBadge(user.subscriptionPlan)}
              {subscriptionStatusBadge(user.subscriptionStatus)}
            </div>
          </div>
          <div className="rounded-2xl bg-muted/50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em]">WhatsApp</p>
            <div className="mt-2">{whatsappBadge(user.whatsappStatus)}</div>
          </div>
          <div className="rounded-2xl bg-muted/50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em]">Atividade</p>
            <p className="mt-2 text-foreground">{formatDate(user.lastActivityAt)}</p>
          </div>
          <div className="rounded-2xl bg-muted/50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em]">Movimentacoes</p>
            <p className="mt-2 text-foreground">{formatCount(user.movementsCount)}</p>
          </div>
          <div className="rounded-2xl bg-muted/50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em]">Helena</p>
            <p className="mt-2 text-foreground">{formatCount(user.helenaMessagesCount)}</p>
          </div>
        </div>

        <Button asChild className="w-full" variant="outline">
          <Link href={`/admin/usuarios/${user.id}`}>Ver detalhes</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default async function AdminUsuariosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const filters = normalizeAdminUserFilters(resolvedSearchParams);
  const usersResult = await listAdminUsers(filters);
  const hasFilters = Boolean(filters.query || filters.role !== "all" || filters.whatsapp !== "all");
  const previousHref = buildPageHref(filters, Math.max(filters.page - 1, 1));
  const nextHref = buildPageHref(filters, Math.min(filters.page + 1, usersResult.totalPages));

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">Admin FechouMEI</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">Usuarios</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Gerencie contas, permissoes e sinais operacionais dos usuarios.
            </p>
          </div>
          <Badge className="w-fit" variant={usersResult.available ? "success" : "danger"}>
            {usersResult.available ? `${formatCount(usersResult.total)} usuarios` : "Indisponivel"}
          </Badge>
        </div>
      </div>

      <Card className="overflow-hidden rounded-[26px]">
        <CardContent className="p-4 sm:p-5">
          <form action="/admin/usuarios" className="grid gap-3 md:grid-cols-[1fr_160px_180px_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" defaultValue={filters.query} name="q" placeholder="Buscar por nome ou e-mail..." />
            </div>
            <Select defaultValue={filters.role} name="role">
              <option value="all">Todas roles</option>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </Select>
            <Select defaultValue={filters.whatsapp} name="whatsapp">
              <option value="all">WhatsApp: todos</option>
              <option value="linked">Vinculado</option>
              <option value="unlinked">Nao vinculado</option>
            </Select>
            <Button type="submit">Filtrar</Button>
            {hasFilters ? (
              <Button asChild variant="outline">
                <Link href="/admin/usuarios">Limpar</Link>
              </Button>
            ) : null}
          </form>
        </CardContent>
      </Card>

      {!usersResult.available ? (
        <Card className="overflow-hidden rounded-[26px] border-destructive/20 bg-destructive/5">
          <CardContent className="flex gap-4 p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <UsersRound className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-foreground">Nao foi possivel carregar usuarios</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {usersResult.error ?? "Aplique a migration da Fase 4 e tente novamente."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : usersResult.users.length === 0 ? (
        <Card className="overflow-hidden rounded-[26px]">
          <CardContent className="flex flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
              <UserRound className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-extrabold text-foreground">Nenhum usuario encontrado</h2>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              Ajuste a busca ou limpe os filtros para ver mais contas.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            {usersResult.users.map((user) => (
              <UserMobileCard key={user.id} user={user} />
            ))}
          </div>

          <Card className="hidden overflow-hidden rounded-[26px] lg:block">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1060px] text-left">
                  <thead className="border-b border-border/70 bg-muted/45 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                    <tr>
                      <th className="px-5 py-4">Usuario</th>
                      <th className="px-5 py-4">Role</th>
                      <th className="px-5 py-4">Assinatura</th>
                      <th className="px-5 py-4">Cadastro</th>
                      <th className="px-5 py-4">Ultima atividade</th>
                      <th className="px-5 py-4">WhatsApp</th>
                      <th className="px-5 py-4">Uso</th>
                      <th className="px-5 py-4 text-right">Acao</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {usersResult.users.map((user) => (
                      <tr className="bg-card transition-colors hover:bg-muted/30" key={user.id}>
                        <td className="px-5 py-4">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-extrabold text-foreground">{user.fullName ?? "Usuario sem nome"}</p>
                            <p className="mt-1 flex items-center gap-1.5 truncate text-xs font-semibold text-muted-foreground">
                              <Mail className="h-3.5 w-3.5 shrink-0" />
                              {user.email ?? "E-mail indisponivel"}
                            </p>
                          </div>
                        </td>
                        <td className="px-5 py-4">{roleBadge(user.role)}</td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-1.5">
                            {planBadge(user.subscriptionPlan)}
                            {subscriptionStatusBadge(user.subscriptionStatus)}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm font-semibold text-muted-foreground">{formatDate(user.createdAt)}</td>
                        <td className="px-5 py-4 text-sm font-semibold text-muted-foreground">{formatDate(user.lastActivityAt)}</td>
                        <td className="px-5 py-4">{whatsappBadge(user.whatsappStatus)}</td>
                        <td className="px-5 py-4">
                          <div className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5">
                              <WalletCards className="h-3.5 w-3.5" />
                              {formatCount(user.movementsCount)} movimentacoes
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <MessageCircle className="h-3.5 w-3.5" />
                              {formatCount(user.helenaMessagesCount)} mensagens
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/admin/usuarios/${user.id}`}>Ver detalhes</Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-muted-foreground">
              Pagina {usersResult.page} de {usersResult.totalPages} · {formatCount(usersResult.total)} usuarios
            </p>
            <div className="flex gap-2">
              <Button asChild className={cn(usersResult.page <= 1 && "pointer-events-none opacity-50")} variant="outline">
                <Link href={previousHref}>
                  <ArrowLeft className="h-4 w-4" />
                  Anterior
                </Link>
              </Button>
              <Button
                asChild
                className={cn(usersResult.page >= usersResult.totalPages && "pointer-events-none opacity-50")}
                variant="outline"
              >
                <Link href={nextHref}>
                  Proxima
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
