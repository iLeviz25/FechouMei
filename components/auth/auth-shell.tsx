import Link from "next/link";
import { ReceiptText, TrendingUp, Shield, Zap } from "lucide-react";

type AuthShellProps = {
  title: string;
  description: string;
  switchText: string;
  switchHref: string;
  switchLabel: string;
  children: React.ReactNode;
};

const features = [
  {
    icon: TrendingUp,
    title: "Controle total",
    description: "Acompanhe receitas e despesas em tempo real",
  },
  {
    icon: Shield,
    title: "Limite do MEI",
    description: "Monitore seu faturamento e evite surpresas",
  },
  {
    icon: Zap,
    title: "Simples e rapido",
    description: "Interface intuitiva feita para o dia a dia",
  },
];

export function AuthShell({
  title,
  description,
  switchText,
  switchHref,
  switchLabel,
  children,
}: AuthShellProps) {
  return (
    <main className="min-h-screen overflow-x-hidden bg-background">
      <div className="grid min-h-screen lg:grid-cols-[1fr_480px]">
        {/* Left Side - Branding */}
        <section className="relative order-2 hidden bg-foreground px-8 py-12 lg:order-1 lg:flex lg:flex-col lg:px-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <ReceiptText className="h-5 w-5" />
            </div>
            <span className="text-xl font-semibold tracking-tight text-background">
              FechouMEI
            </span>
          </div>

          {/* Main Content */}
          <div className="flex flex-1 flex-col justify-center py-12">
            <div className="max-w-lg space-y-6">
              <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight text-background xl:text-5xl">
                Seu controle financeiro como MEI, simplificado.
              </h1>
              <p className="text-pretty text-lg leading-relaxed text-background/70">
                Gerencie receitas, despesas e obrigacoes fiscais em um unico lugar. Feche o mes com
                clareza e tranquilidade.
              </p>
            </div>

            {/* Features */}
            <div className="mt-12 space-y-4">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.title}
                    className="flex items-start gap-4 rounded-xl border border-background/10 bg-background/5 p-4"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium text-background">{feature.title}</p>
                      <p className="mt-0.5 text-sm text-background/60">{feature.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <p className="text-sm text-background/50">
            Feito para microempreendedores brasileiros
          </p>
        </section>

        {/* Right Side - Form */}
        <section className="order-1 flex flex-col justify-center bg-card px-5 py-10 sm:px-10 lg:order-2 lg:px-12">
          {/* Mobile Logo */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <ReceiptText className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-foreground">
              FechouMEI
            </span>
          </div>

          <div className="mx-auto w-full max-w-sm">
            <div className="mb-8 space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
            </div>

            {children}

            <p className="mt-8 text-center text-sm text-muted-foreground">
              {switchText}{" "}
              <Link
                className="font-medium text-primary transition-colors hover:text-primary/80"
                href={switchHref}
              >
                {switchLabel}
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
