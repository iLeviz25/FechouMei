import Link from "next/link";
import { ArrowUpRight, CheckCircle2, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import { Logo } from "@/components/brand/logo";

type AuthShellProps = {
  title: string;
  description: string;
  switchText: string;
  switchHref: string;
  switchLabel: string;
  children: React.ReactNode;
};

export function AuthShell({
  title,
  description,
  switchText,
  switchHref,
  switchLabel,
  children,
}: AuthShellProps) {
  return (
    <main className="min-h-screen overflow-x-hidden bg-gradient-surface lg:grid lg:grid-cols-[1fr_1.05fr]">
      <section className="flex min-h-screen flex-col px-5 py-6 sm:px-10 lg:min-h-0 lg:py-10">
        <div className="flex items-center justify-between">
          <Link aria-label="FechouMEI" href="/login">
            <Logo size="md" />
          </Link>
          <p className="text-xs font-semibold text-muted-foreground sm:text-sm">Feito para MEI</p>
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8 sm:py-12">
          <div className="mb-7">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles className="h-3 w-3" />
              FechouMEI
            </div>
            <h1 className="text-balance mt-4 text-[28px] font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">
              {title}
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{description}</p>
          </div>

          {children}

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {switchText}{" "}
            <Link className="font-bold text-primary hover:underline" href={switchHref}>
              {switchLabel}
            </Link>
          </p>
        </div>

        <p className="text-center text-xs text-muted-foreground">(c) {new Date().getFullYear()} FechouMEI</p>
      </section>

      <section className="relative hidden overflow-hidden bg-gradient-hero lg:block">
        <div className="absolute inset-0 grain opacity-50" />
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,hsl(var(--primary-glow)/0.28)_0%,transparent_70%)]" />
        <div className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-[radial-gradient(circle,hsl(38_95%_55%/0.2)_0%,transparent_70%)]" />

        <div className="relative flex h-full flex-col justify-between p-12 text-primary-foreground">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-xs font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
            Organize seu MEI sem planilha
          </div>

          <div className="relative mx-auto w-full max-w-sm">
            <div className="absolute -left-6 -top-6 rounded-2xl bg-secondary px-4 py-3 text-secondary-foreground shadow-amber">
              <div className="text-[10px] font-bold uppercase tracking-wider">DAS pago</div>
              <div className="text-sm font-bold">R$ 75,90</div>
            </div>

            <div className="rounded-[28px] bg-card p-6 text-foreground shadow-elevated">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Saldo do mes
                  </p>
                  <p className="font-mono mt-1 text-3xl font-extrabold tabular text-foreground">R$ 8.420</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <TrendingUp className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Limite MEI</span>
                  <span className="font-semibold text-foreground">42% usado</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-[42%] rounded-full bg-gradient-glow" />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-success/10 p-3">
                  <p className="text-[10px] font-bold uppercase text-success">Entradas</p>
                  <p className="font-mono mt-0.5 text-sm font-bold tabular text-foreground">+ R$ 12.300</p>
                </div>
                <div className="rounded-2xl bg-destructive/10 p-3">
                  <p className="text-[10px] font-bold uppercase text-destructive">Saidas</p>
                  <p className="font-mono mt-0.5 text-sm font-bold tabular text-foreground">- R$ 3.880</p>
                </div>
              </div>
            </div>

            <div className="absolute -bottom-4 -right-4 rounded-2xl bg-primary-foreground px-4 py-3 text-foreground shadow-elevated">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Limite ok
                  </div>
                  <div className="text-xs font-bold">Tudo sob controle</div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-balance text-2xl font-bold leading-tight">
              Tudo que voce precisa para fechar o mes com clareza.
            </h2>
            <ul className="space-y-1.5 text-sm text-primary-foreground/80">
              {[
                "Entradas, despesas e saldo no mesmo lugar",
                "Limite anual do MEI sempre visivel",
                "Checklist, fechamento e Helena integrados",
              ].map((item) => (
                <li className="flex items-center gap-2" key={item}>
                  <CheckCircle2 className="h-4 w-4 text-secondary" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-secondary">
              Ver seu mes em minutos
              <ArrowUpRight className="h-4 w-4" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
