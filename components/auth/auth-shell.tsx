import Link from "next/link";
import { Badge } from "@/components/ui/badge";

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
    <main className="min-h-screen overflow-x-hidden bg-neutral-50">
      <div className="grid min-h-screen lg:grid-cols-[1fr_520px]">
        <section className="order-2 flex items-center px-4 py-8 sm:px-10 lg:order-1 lg:px-16">
          <div className="mx-auto w-full max-w-2xl space-y-6 sm:space-y-10">
            <div className="space-y-5">
              <Badge variant="success" className="w-fit">
                FechouMEI
              </Badge>
              <div className="space-y-4">
                <h1 className="max-w-xl text-3xl font-semibold leading-tight text-neutral-950 sm:text-5xl">
                  Seu mês organizado com menos atrito.
                </h1>
                <p className="max-w-lg text-base leading-7 text-neutral-600">
                  Controle entradas, despesas, obrigações e limite do MEI em um painel simples,
                  pronto para virar rotina.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
              {[
                ["R$ 0,00", "entradas do mês"],
                ["0%", "limite usado"],
                ["3 passos", "para começar"],
              ].map(([value, label]) => (
                <div key={label} className="rounded-lg border bg-white p-4 shadow-sm sm:p-5">
                  <p className="text-xl font-semibold text-neutral-950 sm:text-2xl">{value}</p>
                  <p className="mt-2 text-sm text-neutral-500">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="order-1 flex items-center bg-white px-4 py-8 sm:px-10 lg:order-2 lg:border-l lg:py-10">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-6 space-y-2 sm:mb-8">
              <h2 className="text-xl font-semibold text-neutral-950 sm:text-2xl">{title}</h2>
              <p className="text-sm leading-6 text-neutral-600">{description}</p>
            </div>
            {children}
            <p className="mt-6 text-center text-sm text-neutral-600">
              {switchText}{" "}
              <Link className="font-medium text-emerald-700 hover:text-emerald-800" href={switchHref}>
                {switchLabel}
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
