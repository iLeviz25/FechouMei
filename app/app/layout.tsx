import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getBillingCycles } from "@/lib/billing/plans";
import { getObligationNotificationsForUser } from "@/lib/obrigacoes/notifications";
import { getCurrentUserProfile } from "@/lib/profile";
import {
  getSubscriptionAccessFromProfile,
  getSubscriptionBlockedReply,
  getSubscriptionBlockedTitle,
  getSubscriptionStatusLabel,
  type SubscriptionAccess,
} from "@/lib/subscription/access";

function getCurrentMonthKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
    year: "numeric",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? String(new Date().getFullYear());
  const month = parts.find((part) => part.type === "month")?.value ?? String(new Date().getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

export default async function AuthenticatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { profile, profileError, supabase, user } = await getCurrentUserProfile();

  if (!user) {
    redirect("/login");
  }

  if (profileError) {
    throw new Error(`Erro ao carregar perfil: ${profileError.message}`);
  }

  if (!profile?.onboarding_completed) {
    redirect("/onboarding");
  }

  const subscriptionAccess = getSubscriptionAccessFromProfile(profile);

  if (!subscriptionAccess.canAccessApp) {
    return <SubscriptionBlockedScreen access={subscriptionAccess} />;
  }

  const notifications = await getObligationNotificationsForUser({
    monthKey: getCurrentMonthKey(),
    supabase,
    userId: user.id,
  });

  return <AppShell isAdmin={profile.role === "admin"} notifications={notifications} profile={profile}>{children}</AppShell>;
}

function SubscriptionBlockedScreen({ access }: { access: SubscriptionAccess }) {
  const title = getSubscriptionBlockedTitle(access.status);
  const reply = getSubscriptionBlockedReply(access.status);
  const statusLabel = getSubscriptionStatusLabel(access.status);
  const monthlyCheckoutUrl = getBillingCycles()[0]?.checkoutUrl;
  const supportSubject = "Suporte FechouMEI - Acesso após compra";
  const supportBody = [
    "Olá, acabei de comprar o FechouMEI e preciso de ajuda com meu acesso.",
    "",
    "E-mail usado na compra:",
    "Nome:",
    "Plano comprado:",
    "Mensagem:",
  ].join("\n");
  const supportHref = `mailto:fechoumei@gmail.com?subject=${encodeURIComponent(supportSubject)}&body=${encodeURIComponent(supportBody)}`;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/35 px-4 py-10">
      <Card className="w-full max-w-lg overflow-hidden rounded-[26px] border-border/70">
        <CardContent className="space-y-5 p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">FechouMEI</p>
              <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground">{title}</h1>
            </div>
            <Badge variant="secondary">{statusLabel}</Badge>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">{reply}</p>
          {access.status === "pending_payment" ? (
            <p className="rounded-2xl border border-border/70 bg-background p-4 text-sm leading-6 text-muted-foreground">
              Se você já pagou, entre usando exatamente o e-mail informado na compra. A liberação pode levar alguns minutos; se não liberar, fale com o suporte antes de comprar novamente.
            </p>
          ) : null}
          <div className="rounded-2xl border border-border/70 bg-background p-4 text-sm font-semibold leading-6 text-muted-foreground">
            Acesso: <span className="font-extrabold text-foreground">{access.status === "active" ? "Ativo" : statusLabel}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {access.status === "pending_payment" && monthlyCheckoutUrl ? (
              <Button asChild>
                <a href={monthlyCheckoutUrl}>Comprar acesso</a>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <a href={supportHref}>Falar com suporte</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
