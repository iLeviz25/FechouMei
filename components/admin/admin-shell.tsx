import type { ReactNode } from "react";
import { AdminHeader } from "@/components/admin/admin-header";
import { AdminMobileNav } from "@/components/admin/admin-mobile-nav";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { RouteWarmup } from "@/components/navigation/fast-navigation-link";

const adminWarmupRoutes = [
  "/admin",
  "/admin/usuarios",
  "/admin/helena",
  "/admin/logs",
  "/admin/configuracoes",
  "/app/dashboard",
];

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-surface text-foreground">
      <RouteWarmup routes={adminWarmupRoutes} />
      <AdminSidebar />
      <div className="min-h-screen lg:pl-72">
        <AdminHeader />
        <AdminMobileNav />
        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
