import {
  Bot,
  ClipboardList,
  LayoutDashboard,
  Settings,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

export type AdminNavItemConfig = {
  exact?: boolean;
  href: string;
  icon: LucideIcon;
  label: string;
};

export const adminNavItems: AdminNavItemConfig[] = [
  { exact: true, href: "/admin", icon: LayoutDashboard, label: "Visao geral" },
  { href: "/admin/usuarios", icon: UsersRound, label: "Usuarios" },
  { href: "/admin/helena", icon: Bot, label: "Helena / WhatsApp" },
  { href: "/admin/logs", icon: ClipboardList, label: "Logs e erros" },
  { href: "/admin/configuracoes", icon: Settings, label: "Configuracoes" },
];
