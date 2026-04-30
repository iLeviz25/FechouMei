"use client";

import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const pageMeta: Record<string, { description: string; title: string }> = {
  "/admin": {
    description: "Base operacional para acompanhar o produto.",
    title: "Visao geral",
  },
  "/admin/usuarios": {
    description: "Contas, permissoes e status dos usuarios.",
    title: "Usuarios",
  },
  "/admin/helena": {
    description: "Conexoes, mensagens e status do agente.",
    title: "Helena / WhatsApp",
  },
  "/admin/logs": {
    description: "Falhas, eventos e execucoes importantes.",
    title: "Logs e erros",
  },
  "/admin/configuracoes": {
    description: "Parametros internos do produto.",
    title: "Configuracoes admin",
  },
};

export function AdminHeader() {
  const pathname = usePathname();
  const meta = pageMeta[pathname] ?? pageMeta["/admin"];

  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/98 px-4 py-3 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge className="hidden sm:inline-flex" variant="success">
              <ShieldCheck className="mr-1 h-3 w-3" />
              ADMIN
            </Badge>
            <p className="truncate text-sm font-bold text-foreground">{meta.title}</p>
          </div>
          <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">{meta.description}</p>
        </div>

        <Button asChild size="sm" variant="outline">
          <Link href="/app/dashboard">
            <ArrowLeft className="h-4 w-4" />
            Voltar para o app
          </Link>
        </Button>
      </div>
    </header>
  );
}
