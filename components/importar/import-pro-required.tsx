import Link from "next/link";
import { ArrowRight, Download, LockKeyhole, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function ImportProRequired() {
  return (
    <div className="mobile-section-gap">
      <Card className="overflow-hidden rounded-[32px] border-secondary/25 bg-secondary-soft/45">
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="icon-tile flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] bg-background text-secondary-foreground">
              <LockKeyhole className="h-5 w-5" />
            </div>
            <div className="max-w-2xl space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-secondary-foreground">Acesso completo</p>
              <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">Importacao incluida no FechouMEI Completo</h1>
              <p className="text-sm leading-6 text-muted-foreground">
                No seu acesso atual, a exportacao pelo app continua liberada. Importacao pelo app e arquivos pela Helena fazem parte do acesso completo.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[24px] border border-border/70 bg-background/80 p-4">
              <div className="flex items-center gap-2 text-sm font-extrabold text-foreground">
                <Download className="h-4 w-4 text-primary" />
                Exportacao pelo app
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Liberada para assinaturas ativas.</p>
            </div>
            <div className="rounded-[24px] border border-border/70 bg-background/80 p-4">
              <div className="flex items-center gap-2 text-sm font-extrabold text-foreground">
                <Upload className="h-4 w-4 text-secondary-foreground" />
                Importacao
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Incluida no FechouMEI Completo pelo app e pela Helena/WhatsApp.</p>
            </div>
          </div>

          <Button asChild className="w-full sm:w-fit">
            <Link href="/app/configuracoes">
              Ver assinatura em Configuracoes
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
