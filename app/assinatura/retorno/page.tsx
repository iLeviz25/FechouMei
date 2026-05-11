import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, LogIn, Mail, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCheckoutReturnCycleLabel } from "@/lib/billing/return-copy";

export const metadata: Metadata = {
  title: "Compra recebida | FechouMEI",
  description: "Acompanhe os próximos passos para acessar o FechouMEI após a compra.",
};

type AssinaturaRetornoPageProps = {
  searchParams?: Promise<{
    cycle?: string;
  }>;
};

const nextSteps = [
  "Abra o e-mail usado na compra.",
  "Clique no link de acesso enviado.",
  "Crie sua senha.",
  "Faça o onboarding inicial.",
  "Comece a usar o FechouMEI.",
];

const supportEmail = "fechoumei@gmail.com";
const supportSubject = "Suporte FechouMEI - Acesso após compra";
const supportBody = [
  "Olá, acabei de comprar o FechouMEI e preciso de ajuda com meu acesso.",
  "",
  "E-mail usado na compra:",
  "Nome:",
  "Plano comprado:",
  "Mensagem:",
].join("\n");
const supportHref = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(supportEmail)}&su=${encodeURIComponent(supportSubject)}&body=${encodeURIComponent(supportBody)}`;

export default async function AssinaturaRetornoPage({
  searchParams,
}: AssinaturaRetornoPageProps) {
  const params = await searchParams;
  const cycleLabel = getCheckoutReturnCycleLabel(params?.cycle);

  return (
    <main className="min-h-screen bg-gradient-surface px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-3xl flex-col">
        <header className="flex items-center justify-between gap-3">
          <Link aria-label="FechouMEI" href="/login">
            <Logo size="md" />
          </Link>
          <Badge className="shrink-0" variant="success">
            Acesso por e-mail
          </Badge>
        </header>

        <section className="flex flex-1 items-center py-8 sm:py-12">
          <Card className="w-full rounded-[26px]">
            <CardContent className="p-5 sm:p-8">
              <div className="flex flex-col gap-6">
                <div>
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                    <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="warning">Compra recebida</Badge>
                    {cycleLabel ? <Badge variant="secondary">{cycleLabel}</Badge> : null}
                  </div>

                  <h1 className="mt-4 text-balance text-[30px] font-extrabold leading-tight text-foreground sm:text-4xl">
                    Compra recebida!
                  </h1>

                  <p className="mt-3 text-[15px] leading-7 text-muted-foreground sm:text-base">
                    Seu pagamento está sendo processado. Assim que a confirmação chegar, vamos
                    enviar o acesso para o e-mail usado na compra.
                  </p>

                  <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-[15px]">
                    Se o pagamento já foi aprovado, verifique sua caixa de entrada e também a pasta
                    de spam/lixo eletrônico. Você receberá um link para criar sua senha e acessar o
                    FechouMEI.
                  </p>
                </div>

                <div className="border-t border-border/80 pt-5">
                  <div className="mb-4 flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
                    <h2 className="text-base font-extrabold text-foreground">Próximos passos</h2>
                  </div>

                  <ol className="space-y-3">
                    {nextSteps.map((step, index) => (
                      <li className="flex gap-3 text-sm leading-6 text-foreground" key={step}>
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-extrabold text-primary">
                          {index + 1}
                        </span>
                        <span className="pt-0.5">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Button asChild size="lg">
                    <Link href="/login">
                      <LogIn className="h-4 w-4" aria-hidden="true" />
                      Ir para login
                    </Link>
                  </Button>

                  <Button asChild size="lg" variant="outline">
                    <a href={supportHref} rel="noopener noreferrer" target="_blank">
                      <Mail className="h-4 w-4" aria-hidden="true" />
                      Falar com suporte
                    </a>
                  </Button>
                </div>

                <div className="flex items-start gap-2 rounded-[18px] border border-primary/10 bg-primary-soft/60 p-3 text-xs leading-5 text-muted-foreground">
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <p>
                    A liberação acontece automaticamente pelo webhook de pagamento. Esta página não
                    confirma pagamento nem ativa assinatura.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
