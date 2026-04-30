"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminNavItems } from "@/components/admin/admin-nav";
import { cn } from "@/lib/utils";

export function AdminMobileNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-border/70 bg-background/98 px-4 py-3 lg:hidden">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {adminNavItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-bold transition-colors",
                isActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border/70 bg-card text-muted-foreground hover:border-primary/25 hover:text-foreground",
              )}
              href={item.href}
              key={item.href}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
