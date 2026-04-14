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
  { href: "/app/dashboard", label: "Dashboard", shortLabel: "Início", icon: LayoutDashboard },
  {
    href: "/app/movimentacoes",
    label: "Movimentações",
    shortLabel: "Mov.",
    icon: WalletCards,
  },
  {
    href: "/app/fechamento-mensal",
    label: "Fechamento mensal",
    shortLabel: "Fechar",
    icon: BarChart3,
  },
  { href: "/app/obrigacoes", label: "Obrigações", shortLabel: "Tarefas", icon: CalendarCheck },
  { href: "/app/configuracoes", label: "Configurações", shortLabel: "Conta", icon: Settings },
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
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-neutral-200 bg-white md:flex md:flex-col">
        <div className="flex h-full flex-col p-4">
          <Link className="mb-8 flex items-center gap-3 px-2 pt-2" href="/app/dashboard">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-700 text-white shadow-sm">
              <ReceiptText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-base font-semibold text-neutral-950">FechouMEI</p>
              <p className="text-xs text-neutral-500">Financeiro do mês</p>
            </div>
          </Link>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-950",
                    isActive && "bg-emerald-50 text-emerald-800 shadow-sm",
                  )}
                  href={item.href}
                  key={item.href}
                  prefetch
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto space-y-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white text-sm font-semibold text-neutral-900 shadow-sm">
                {initials || "ME"}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-950">
                  {profile?.full_name ?? "Sua conta"}
                </p>
                <p className="truncate text-xs text-neutral-500">
                  {profile?.main_category ?? "MEI"}
                </p>
              </div>
            </div>
            <Button className="w-full justify-start" onClick={handleSignOut} variant="outline">
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/95 px-3 py-3 shadow-sm backdrop-blur md:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link className="flex items-center gap-2 font-semibold text-neutral-950" href="/app/dashboard">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-700 text-white">
              <ReceiptText className="h-4 w-4" />
            </span>
            FechouMEI
          </Link>
          <Button onClick={handleSignOut} size="sm" variant="outline">
            Sair
          </Button>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-neutral-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-1 text-[11px] font-medium text-neutral-500 transition-colors",
                isActive && "bg-emerald-50 text-emerald-800 shadow-sm",
              )}
              href={item.href}
              key={item.href}
              prefetch
            >
              <Icon className="h-4 w-4" />
              <span className="max-w-full truncate">{item.shortLabel}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
