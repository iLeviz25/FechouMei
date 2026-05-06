import Link from "next/link";
import { ArrowRight, LockKeyhole, Upload } from "lucide-react";
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
              <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">Importação disponível no FechouMEI Completo</h1>
              <p className="text-sm leading-6 text-muted-foreground">
                Para importar arquivos, sua assinatura precisa estar ativa. Finalize sua assinatura para liberar o acesso completo ao FechouMEI.
              </p>
            </div>
          </div>

          <div className="rounded-[24px] border border-border/70 bg-background/80 p-4">
            <div className="flex items-center gap-2 text-sm font-extrabold text-foreground">
              <Upload className="h-4 w-4 text-secondary-foreground" />
              Acesso completo
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Assim que o pagamento for confirmado, a importação pelo app e pela Helena/WhatsApp fica liberada automaticamente.
            </p>
          </div>

          <Button asChild className="w-full sm:w-fit">
            <Link href="/app/configuracoes">
              Ver acesso
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
