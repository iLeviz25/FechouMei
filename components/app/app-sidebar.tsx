"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BellRing,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Receipt,
  Settings,
  UserCircle2,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";

type AppSidebarProps = {
  profile: Profile | null;
};

const navItems = [
  { href: "/app/dashboard", label: "Inicio", shortLabel: "Inicio", icon: LayoutDashboard },
  { href: "/app/movimentacoes", label: "Movimentacoes", shortLabel: "Mov.", icon: Receipt },
  { href: "/app/fechamento-mensal", label: "Fechamento mensal", shortLabel: "Fechar", icon: ClipboardCheck },
  { href: "/app/obrigacoes", label: "Obrigacoes", shortLabel: "Obrig.", icon: BellRing },
  { href: "/app/agente", label: "Helena", shortLabel: "Helena", icon: MessageCircle },
  { href: "/app/configuracoes", label: "Configuracoes", shortLabel: "Conta", icon: Settings },
];

export function AppSidebar({ profile }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const visiblePathname = pendingHref ?? pathname;
  const initials = (profile?.full_name ?? "MEI")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      navItems.forEach((item) => router.prefetch(item.href));
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [router]);

  useEffect(() => {
    setPendingHref(null);
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
          className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 bg-transparent"
          role="progressbar"
        >
          <div className="animate-pulse h-full w-full origin-left bg-primary/80 shadow-glow" />
        </div>
      ) : null}

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-background))] lg:flex lg:flex-col">
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
                      "group relative flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-bold transition-all",
                      isActive
                        ? "bg-gradient-brand text-primary-foreground shadow-glow"
                        : "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-accent-foreground))]",
                    )}
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
          </div>

          <div className="space-y-3 border-t border-[hsl(var(--sidebar-border))] px-1 pt-4">
            <div className="flex items-center gap-3 rounded-2xl border border-[hsl(var(--sidebar-border))] bg-muted/40 p-3 shadow-card">
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-sm font-extrabold text-primary-foreground shadow-glow">
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

      <header className="fixed inset-x-0 top-0 z-20 border-b border-border/70 bg-card/95 px-4 py-3 shadow-sm backdrop-blur lg:hidden">
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
          <Link
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-background text-muted-foreground shadow-card"
            href="/app/configuracoes"
          >
            <UserCircle2 className="h-5 w-5" />
          </Link>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-border/70 bg-card/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
        {navItems.map((item) => {
          const isActive = visiblePathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[10px] font-bold transition-colors",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
              href={item.href}
              key={item.href}
              onClick={() => markRoutePending(item.href)}
              onFocus={() => warmRoute(item.href)}
              onPointerEnter={() => warmRoute(item.href)}
              onTouchStart={() => warmRoute(item.href)}
              prefetch
            >
              {isActive ? <span className="absolute -top-1 h-1 w-6 rounded-full bg-primary" /> : null}
              <Icon className="h-4 w-4" />
              <span className="max-w-full truncate">{item.shortLabel}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
