"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  CalendarCheck,
  LayoutDashboard,
  LogOut,
  ReceiptText,
  Settings,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";

type AppSidebarProps = {
  profile: Profile | null;
};

const navItems = [
  { href: "/app/dashboard", label: "Dashboard", shortLabel: "Inicio", icon: LayoutDashboard },
  {
    href: "/app/movimentacoes",
    label: "Movimentacoes",
    shortLabel: "Mov.",
    icon: WalletCards,
  },
  {
    href: "/app/fechamento-mensal",
    label: "Fechamento",
    shortLabel: "Fechar",
    icon: BarChart3,
  },
  { href: "/app/obrigacoes", label: "Obrigacoes", shortLabel: "Tarefas", icon: CalendarCheck },
  { href: "/app/configuracoes", label: "Configuracoes", shortLabel: "Config", icon: Settings },
];

export function AppSidebar({ profile }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const initials = (profile?.full_name ?? "MEI")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border bg-sidebar md:flex md:flex-col">
        <div className="flex h-full flex-col px-4 py-6">
          {/* Logo */}
          <Link
            className="mb-8 flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-sidebar-accent"
            href="/app/dashboard"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <ReceiptText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-base font-semibold tracking-tight text-sidebar-foreground">
                FechouMEI
              </p>
              <p className="text-xs text-muted-foreground">Controle financeiro</p>
            </div>
          </Link>

          {/* Navigation */}
          <nav className="flex-1 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                  )}
                  href={item.href}
                  key={item.href}
                  prefetch
                >
                  <Icon
                    className={cn(
                      "h-[18px] w-[18px] transition-colors",
                      isActive
                        ? "text-sidebar-primary"
                        : "text-muted-foreground group-hover:text-sidebar-foreground",
                    )}
                  />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* User Profile Card */}
          <div className="mt-auto space-y-3 rounded-xl border border-sidebar-border bg-muted/30 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold text-primary">
                {initials || "ME"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-sidebar-foreground">
                  {profile?.full_name ?? "Sua conta"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {profile?.main_category ?? "MEI"}
                </p>
              </div>
            </div>
            <Button
              className="w-full justify-start gap-2"
              onClick={handleSignOut}
              variant="ghost"
              size="sm"
            >
              <LogOut className="h-4 w-4" />
              Sair da conta
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 px-4 py-3 backdrop-blur-md md:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link
            className="flex items-center gap-2.5"
            href="/app/dashboard"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <ReceiptText className="h-4 w-4" />
            </span>
            <span className="text-base font-semibold tracking-tight text-foreground">
              FechouMEI
            </span>
          </Link>
          <Button onClick={handleSignOut} size="sm" variant="ghost">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-md md:hidden">
        <div className="grid grid-cols-5 gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-xl py-2 text-[10px] font-medium transition-all duration-200",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground active:bg-accent/50",
                )}
                href={item.href}
                key={item.href}
                prefetch
              >
                <Icon className={cn("h-5 w-5", isActive && "text-primary")} />
                <span className="max-w-full truncate">{item.shortLabel}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
