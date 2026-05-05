"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BellRing,
  ChevronRight,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Plus,
  Receipt,
  Settings,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import type { ObligationNotification } from "@/lib/obrigacoes/notifications";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";

type AppSidebarProps = {
  profile: Profile | null;
  isAdmin?: boolean;
  notifications?: ObligationNotification[];
};

const navItems = [
  { href: "/app/dashboard", label: "Dashboard", shortLabel: "Dashboard", icon: LayoutDashboard, tourTarget: "dashboard-nav" },
  { href: "/app/movimentacoes", label: "Movimentacoes", shortLabel: "Mov.", icon: Receipt, tourTarget: "movimentacoes-nav" },
  { href: "/app/importar", label: "Importar dados", shortLabel: "Importar", icon: Upload, tourTarget: "importacao-nav" },
  { href: "/app/fechamento-mensal", label: "Fechamento mensal", shortLabel: "Fechamento", icon: ClipboardCheck, tourTarget: "fechamento-nav" },
  { href: "/app/relatorios", label: "Relatorios", shortLabel: "Relatorios", icon: FileText, tourTarget: "relatorios-nav" },
  { href: "/app/obrigacoes", label: "Obrigacoes", shortLabel: "Obrig.", icon: BellRing, tourTarget: "obrigacoes-nav" },
  { href: "/app/agente", label: "Helena", shortLabel: "Helena", icon: MessageCircle, tourTarget: "helena-nav" },
  { href: "/app/configuracoes", label: "Configuracoes", shortLabel: "Conta", icon: Settings },
];

const adminNavItem = {
  href: "/admin",
  icon: ShieldCheck,
  label: "Painel Admin",
  shortLabel: "Admin",
};

const createMovementHref = "/app/movimentacoes?nova=1";
const mobileNavItems = [
  navItems[0],
  navItems[1],
  { href: createMovementHref, label: "Nova movimentacao", shortLabel: "Novo", icon: Plus, primaryAction: true },
  navItems[3],
  navItems[5],
];
const mobileShortcutItems = [
  { ...navItems[2], quickTourId: "quick-import" },
  { ...navItems[4], quickTourId: "quick-reports" },
  { ...navItems[6], quickTourId: "quick-helena" },
];

const MovementCreateSheet = dynamic(
  () =>
    import("@/components/movimentacoes/movement-create-sheet").then(
      (module) => module.MovementCreateSheet,
    ),
  { loading: () => null, ssr: false },
);

function getPathOnly(href: string) {
  return href.split("?")[0] ?? href;
}

function canWarmRouteOnThisDevice() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );
}

export function AppSidebar({ profile, isAdmin = false, notifications = [] }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [globalCreateOpen, setGlobalCreateOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const visiblePathname = getPathOnly(pendingHref ?? pathname);
  const settingsIsActive = visiblePathname === "/app/configuracoes";
  const initials = (profile?.full_name ?? "MEI")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  useEffect(() => {
    setPendingHref(null);
    setNotificationsOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!pendingHref) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setPendingHref(null);
    }, 4000);

    return () => window.clearTimeout(timeout);
  }, [pendingHref]);

  function warmRoute(href: string) {
    if (!canWarmRouteOnThisDevice()) {
      return;
    }

    router.prefetch(href);
  }

  function markRoutePending(href: string) {
    if (getPathOnly(href) !== pathname) {
      setPendingHref(href);
    }
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      {pendingHref ? (
        <div
          aria-label="Carregando rota"
          aria-valuetext="Carregando"
          className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 bg-transparent print:hidden"
          role="progressbar"
        >
          <div className="h-full w-full origin-left bg-primary/80" />
        </div>
      ) : null}

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-background))] print:hidden lg:flex lg:flex-col">
        <div className="flex h-full flex-col px-3 pb-4 pt-4">
          <div className="border-b border-[hsl(var(--sidebar-border))] px-2 pb-5">
            <Link
              href="/app/dashboard"
              onClick={() => markRoutePending("/app/dashboard")}
              onFocus={() => warmRoute("/app/dashboard")}
              onPointerEnter={() => warmRoute("/app/dashboard")}
              prefetch={false}
            >
              <Logo size="md" />
            </Link>
            <NotificationBell
              className="mt-4 w-full justify-start px-3"
              dropdownAlign="left"
              notifications={notifications}
              onNavigate={markRoutePending}
              onOpenChange={setNotificationsOpen}
              open={notificationsOpen}
            />
          </div>

          <div className="flex-1 overflow-y-auto px-1 py-4">
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Menu
            </p>
            <nav className="space-y-1">
              {navItems.map((item) => {
                const isActive = visiblePathname === item.href;
                const Icon = item.icon;

                return (
                  <Link
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-bold transition-[background-color,color,box-shadow,border-color]",
                      isActive
                        ? "bg-gradient-brand text-primary-foreground shadow-elevated"
                        : "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-accent-foreground))]",
                    )}
                    data-tour-target={item.tourTarget}
                    href={item.href}
                    key={item.href}
                    onClick={() => markRoutePending(item.href)}
                    onFocus={() => warmRoute(item.href)}
                    onPointerEnter={() => warmRoute(item.href)}
                    prefetch={false}
                  >
                    {isActive ? (
                      <span className="absolute -left-4 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-secondary" />
                    ) : null}
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {isAdmin ? (
              <div className="mt-5 border-t border-[hsl(var(--sidebar-border))] pt-4">
                <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Admin
                </p>
                <Link
                  aria-current={visiblePathname.startsWith("/admin") ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-bold transition-[background-color,color,box-shadow,border-color]",
                    visiblePathname.startsWith("/admin")
                      ? "bg-primary text-primary-foreground shadow-elevated"
                      : "border border-primary/15 bg-primary-soft/35 text-primary hover:border-primary/25 hover:bg-primary-soft/60",
                  )}
                  href={adminNavItem.href}
                  onClick={() => markRoutePending(adminNavItem.href)}
                  onFocus={() => warmRoute(adminNavItem.href)}
                  onPointerEnter={() => warmRoute(adminNavItem.href)}
                  prefetch={false}
                >
                  <ShieldCheck className="h-4 w-4" />
                  {adminNavItem.label}
                </Link>
              </div>
            ) : null}
          </div>

          <div className="space-y-3 border-t border-[hsl(var(--sidebar-border))] px-1 pt-4">
            <div className="flex items-center gap-3 rounded-2xl border border-[hsl(var(--sidebar-border))] bg-muted/40 p-3 shadow-card">
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-sm font-extrabold text-primary-foreground shadow-elevated">
                {initials || "ME"}
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success ring-2 ring-card" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-foreground">{profile?.full_name ?? "Sua conta"}</p>
                <p className="truncate text-[11px] text-muted-foreground">{profile?.main_category ?? "MEI"}</p>
              </div>
              <Button className="h-10 w-10 shrink-0" onClick={handleSignOut} size="icon" variant="ghost">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      <header className="fixed inset-x-0 top-0 z-40 border-b border-border/70 bg-background/98 px-4 py-3.5 shadow-sm print:hidden lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link
            className="flex items-center gap-2"
            href="/app/dashboard"
            onClick={() => markRoutePending("/app/dashboard")}
            onFocus={() => warmRoute("/app/dashboard")}
            onPointerEnter={() => warmRoute("/app/dashboard")}
            prefetch={false}
          >
            <Logo size="sm" />
          </Link>
          <div className="flex items-center gap-1.5">
            <NotificationBell
              mobile
              notifications={notifications}
              onNavigate={markRoutePending}
              onOpenChange={setNotificationsOpen}
              open={notificationsOpen}
            />
            {isAdmin ? (
              <Link
                aria-label="Painel Admin"
                className="surface-panel-ghost flex h-11 w-11 items-center justify-center rounded-[18px] text-primary"
                href="/admin"
                onClick={() => markRoutePending("/admin")}
                onFocus={() => warmRoute("/admin")}
                onPointerEnter={() => warmRoute("/admin")}
                prefetch={false}
              >
                <ShieldCheck className="h-5 w-5" />
              </Link>
            ) : null}
            <Link
              aria-current={settingsIsActive ? "page" : undefined}
              aria-label="Conta e configuracoes"
              className={cn(
                "surface-panel-ghost flex h-11 w-11 items-center justify-center rounded-[18px] text-muted-foreground transition-colors hover:text-foreground",
                settingsIsActive && "border-primary/20 bg-primary-soft/55 text-primary",
              )}
              href="/app/configuracoes"
              onClick={() => markRoutePending("/app/configuracoes")}
              onFocus={() => warmRoute("/app/configuracoes")}
              onPointerEnter={() => warmRoute("/app/configuracoes")}
              prefetch={false}
            >
              <Settings className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </header>

      <div className="fixed inset-x-0 top-[4.65rem] z-30 px-3 print:hidden lg:hidden">
        <nav
          aria-label="Atalhos rapidos"
          className="mx-auto grid h-12 max-w-[560px] grid-cols-3 gap-1.5 rounded-[24px] border border-border/70 bg-white p-1.5 shadow-[0_8px_20px_rgba(15,23,42,0.08)]"
        >
          {mobileShortcutItems.map((item) => {
            const Icon = item.icon;
            const isActive = visiblePathname === item.href;

            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-w-0 items-center justify-center gap-1 rounded-[18px] px-1 text-[10px] font-bold leading-none transition-colors min-[360px]:gap-1.5 min-[360px]:px-2 min-[360px]:text-[11px]",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-primary-soft/45 hover:text-foreground",
                )}
                data-tour-id={item.quickTourId}
                data-tour-target={item.tourTarget}
                href={item.href}
                key={item.href}
                onClick={() => markRoutePending(item.href)}
                onFocus={() => warmRoute(item.href)}
                onPointerEnter={() => warmRoute(item.href)}
                prefetch={false}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 min-[360px]:h-4 min-[360px]:w-4" />
                <span className="whitespace-nowrap">{item.shortLabel}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 px-2.5 pb-[calc(0.65rem+env(safe-area-inset-bottom))] pt-8 print:hidden lg:hidden">
        <nav
          aria-label="Navegacao principal"
          className="mx-auto grid h-[76px] max-w-[560px] grid-cols-[1fr_1fr_80px_1fr_1fr] items-end gap-0.5 rounded-[30px] border border-border/70 bg-white px-2 py-2 shadow-[0_-6px_22px_rgba(15,23,42,0.08),0_14px_28px_rgba(15,23,42,0.08)]"
        >
          {mobileNavItems.map((item) => {
            const isPrimaryAction = "primaryAction" in item && item.primaryAction === true;
            const isActive = !isPrimaryAction && visiblePathname === item.href;
            const Icon = item.icon;
            const navItemClassName = cn(
              "relative flex min-h-[58px] min-w-0 flex-col items-center justify-end gap-1 rounded-[21px] px-0.5 pb-1 text-[9px] font-extrabold leading-none transition-[background-color,color,box-shadow,transform] active:scale-[0.98] min-[390px]:text-[10px]",
              isPrimaryAction && "-mt-9 justify-start pb-0 text-secondary-foreground",
              isActive && !isPrimaryAction && "text-primary",
              !isPrimaryAction && !isActive && "text-muted-foreground hover:bg-primary-soft/35 hover:text-foreground",
            );
            const iconClassName = cn(
              "icon-tile flex h-8 w-8 items-center justify-center rounded-[17px] transition-colors",
              isPrimaryAction
                ? "h-16 w-16 rounded-[24px] bg-gradient-amber text-secondary-foreground shadow-[0_14px_28px_rgba(245,158,11,0.32)]"
                : isActive
                  ? "bg-primary-soft text-primary"
                  : "bg-transparent text-current",
            );
            const labelClassName = cn("max-w-full truncate text-center leading-3", isPrimaryAction && "uppercase tracking-[0.08em]");

            if (isPrimaryAction) {
              return (
                <button
                  aria-label={item.label}
                  className={navItemClassName}
                  key={item.href}
                  onClick={() => {
                    setNotificationsOpen(false);
                    setGlobalCreateOpen(true);
                  }}
                  type="button"
                >
                  <span className={iconClassName}>
                    <Icon className="h-7 w-7" />
                  </span>
                  <span className={labelClassName}>{item.shortLabel}</span>
                </button>
              );
            }

            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={navItemClassName}
                data-tour-target={"tourTarget" in item ? item.tourTarget : undefined}
                href={item.href}
                key={item.href}
                onClick={() => markRoutePending(item.href)}
                onFocus={() => warmRoute(item.href)}
                onPointerEnter={() => warmRoute(item.href)}
                prefetch={false}
              >
                <span className={iconClassName}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className={labelClassName}>{item.shortLabel}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {globalCreateOpen ? (
        <MovementCreateSheet onOpenChange={setGlobalCreateOpen} open={globalCreateOpen} />
      ) : null}
    </>
  );
}

function NotificationBell({
  className,
  dropdownAlign = "right",
  mobile = false,
  notifications,
  onNavigate,
  onOpenChange,
  open,
}: {
  className?: string;
  dropdownAlign?: "left" | "right";
  mobile?: boolean;
  notifications: ObligationNotification[];
  onNavigate: (href: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const count = notifications.length;

  return (
    <div className="relative">
      <button
        aria-expanded={open}
        aria-label={count > 0 ? `${count} notificacoes de obrigacoes` : "Notificacoes"}
        className={cn(
          "surface-panel-ghost relative flex h-11 w-11 items-center justify-center rounded-[18px] text-muted-foreground transition-colors hover:text-foreground",
          className,
        )}
        onClick={() => onOpenChange(!open)}
        type="button"
      >
        <BellRing className="h-5 w-5 shrink-0" />
        <span className={cn("hidden text-sm font-bold", className && "ml-2 inline")}>Notificacoes</span>
        {count > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-secondary px-1 text-[10px] font-extrabold text-secondary-foreground ring-2 ring-background">
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className={cn(
            "z-50 overflow-hidden rounded-[24px] border border-border bg-card shadow-elevated",
            mobile
              ? "fixed left-3 right-3 top-[4.75rem] max-h-[min(26rem,calc(100dvh_-_7rem))] w-auto"
              : cn(
                  "absolute top-12 w-[min(22rem,calc(100vw-2rem))]",
                  dropdownAlign === "left" ? "left-0" : "right-0",
                ),
          )}
        >
          <div className="border-b border-border/70 px-4 py-3">
            <p className="text-sm font-extrabold tracking-tight text-foreground">Notificacoes</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Baseadas nos lembretes e obrigacoes pendentes.</p>
          </div>

          {count === 0 ? (
            <div className="px-4 py-5 text-sm font-semibold text-muted-foreground">
              Nenhuma notificacao no momento.
            </div>
          ) : (
            <div className={cn("scroll-chain-y overflow-y-auto p-2", mobile ? "max-h-[calc(100dvh_-_13rem)]" : "max-h-80")}>
              {notifications.map((notification) => (
                <Link
                  className="group flex items-start gap-3 rounded-[18px] px-3 py-3 transition-colors hover:bg-primary-soft/35"
                  href={notification.href}
                  key={notification.id}
                  onClick={() => {
                    onNavigate(notification.href);
                    onOpenChange(false);
                  }}
                  prefetch={false}
                >
                  <span
                    className={cn(
                      "mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full",
                      notification.status === "overdue" && "bg-destructive",
                      notification.status === "soon" && "bg-secondary",
                      notification.status === "pending" && "bg-primary",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-extrabold text-foreground">{notification.title}</span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]",
                          notification.status === "overdue" && "bg-destructive/10 text-destructive",
                          notification.status === "soon" && "bg-secondary-soft text-secondary-foreground",
                          notification.status === "pending" && "bg-primary/10 text-primary",
                        )}
                      >
                        {notification.statusLabel}
                      </span>
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {notification.description} Prazo: {notification.dueDateLabel}.
                    </span>
                  </span>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
