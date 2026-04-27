"use client";

import { useEffect, useState } from "react";
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
  Receipt,
  Settings,
  ShieldCheck,
  Upload,
  UserCircle2,
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
  { href: "/app/dashboard", label: "Inicio", shortLabel: "Inicio", icon: LayoutDashboard, tourTarget: "dashboard-nav" },
  { href: "/app/movimentacoes", label: "Movimentacoes", shortLabel: "Mov.", icon: Receipt, tourTarget: "movimentacoes-nav" },
  { href: "/app/importar", label: "Importar dados", shortLabel: "Import.", icon: Upload },
  { href: "/app/fechamento-mensal", label: "Fechamento mensal", shortLabel: "Fechar", icon: ClipboardCheck, tourTarget: "fechamento-nav" },
  { href: "/app/relatorios", label: "Relatorios", shortLabel: "Relat.", icon: FileText, tourTarget: "relatorios-nav" },
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

export function AppSidebar({ profile, isAdmin = false, notifications = [] }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const visiblePathname = pendingHref ?? pathname;
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
    router.prefetch(href);
  }

  function markRoutePending(href: string) {
    if (href !== pathname) {
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
              prefetch
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
                    prefetch
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
                  prefetch
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
            onTouchStart={() => warmRoute("/app/dashboard")}
            prefetch
          >
            <Logo size="sm" />
          </Link>
          <div className="flex items-center gap-2">
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
                onTouchStart={() => warmRoute("/admin")}
              >
                <ShieldCheck className="h-5 w-5" />
              </Link>
            ) : null}
            <Link
              className="surface-panel-ghost flex h-11 w-11 items-center justify-center rounded-[18px] text-muted-foreground"
              href="/app/configuracoes"
            >
              <UserCircle2 className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-8 border-t border-border/80 bg-background px-1 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_22px_rgba(15,23,42,0.11)] print:hidden lg:hidden">
        {navItems.map((item) => {
          const isActive = visiblePathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative flex min-h-[64px] min-w-0 flex-col items-center justify-center gap-1 rounded-[16px] px-0.5 text-[8px] font-bold transition-[background-color,color,box-shadow] min-[390px]:text-[9px]",
                isActive
                  ? "bg-card text-primary shadow-sm"
                  : "text-foreground/72 hover:bg-muted/70 hover:text-foreground",
              )}
              data-tour-target={item.tourTarget}
              href={item.href}
              key={item.href}
              onClick={() => markRoutePending(item.href)}
              onFocus={() => warmRoute(item.href)}
              onPointerEnter={() => warmRoute(item.href)}
              onTouchStart={() => warmRoute(item.href)}
              prefetch
            >
              {isActive ? <span className="absolute -top-1 h-1 w-7 rounded-full bg-primary" /> : null}
              <span
                className={cn(
                  "icon-tile flex h-8 w-8 items-center justify-center rounded-2xl transition-colors",
                  isActive ? "bg-primary text-primary-foreground" : "bg-muted/45 text-current",
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="max-w-full truncate text-center leading-3">{item.shortLabel}</span>
            </Link>
          );
        })}
      </nav>
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
            <div className={cn("overflow-y-auto overscroll-contain p-2", mobile ? "max-h-[calc(100dvh_-_13rem)]" : "max-h-80")}>
              {notifications.map((notification) => (
                <Link
                  className="group flex items-start gap-3 rounded-[18px] px-3 py-3 transition-colors hover:bg-primary-soft/35"
                  href={notification.href}
                  key={notification.id}
                  onClick={() => {
                    onNavigate(notification.href);
                    onOpenChange(false);
                  }}
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
