"use client";

import { ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { AdminNavItem } from "@/components/admin/admin-nav-item";
import { adminNavItems } from "@/components/admin/admin-nav";
import { Badge } from "@/components/ui/badge";

export function AdminSidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-border/70 bg-card lg:flex lg:flex-col">
      <div className="flex h-full flex-col px-4 py-5">
        <div className="space-y-4 border-b border-border/70 px-1 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-elevated">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-extrabold tracking-tight text-foreground">Admin FechouMEI</p>
              <p className="text-xs font-semibold text-muted-foreground">Operacao interna</p>
            </div>
          </div>
          <Badge className="w-fit" variant="success">
            ADMIN
          </Badge>
        </div>

        <nav className="flex-1 space-y-1 py-5">
          {adminNavItems.map((item) => (
            <AdminNavItem
              exact={item.exact}
              href={item.href}
              icon={item.icon}
              key={item.href}
              label={item.label}
            />
          ))}
        </nav>

        <div className="border-t border-border/70 pt-4">
          <Link
            className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background px-3 py-3 text-sm font-bold text-foreground transition-[background-color,border-color,color] hover:border-primary/25 hover:bg-primary-soft/30"
            href="/app/dashboard"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            Voltar para o app
          </Link>
        </div>
      </div>
    </aside>
  );
}
