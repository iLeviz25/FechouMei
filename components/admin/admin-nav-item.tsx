"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type AdminNavItemProps = {
  exact?: boolean;
  href: string;
  icon: LucideIcon;
  label: string;
};

export function AdminNavItem({ exact = false, href, icon: Icon, label }: AdminNavItemProps) {
  const pathname = usePathname();
  const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-bold transition-[background-color,color,box-shadow]",
        isActive
          ? "bg-primary text-primary-foreground shadow-elevated"
          : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
      )}
      href={href}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}
