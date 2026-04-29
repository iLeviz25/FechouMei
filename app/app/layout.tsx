import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getObligationNotificationsForUser } from "@/lib/obrigacoes/notifications";
import { getCurrentUserProfile } from "@/lib/profile";
import {
  getSubscriptionAccessFromProfile,
  getSubscriptionBlockedReply,
  getSubscriptionBlockedTitle,
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

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/35 px-4 py-10">
      <Card className="w-full max-w-lg overflow-hidden rounded-[26px] border-border/70">
        <CardContent className="space-y-5 p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">FechouMEI</p>
              <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground">{title}</h1>
            </div>
            <Badge variant="secondary">{access.status}</Badge>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">{reply}</p>
          <div className="rounded-2xl border border-border/70 bg-background p-4 text-sm font-semibold leading-6 text-muted-foreground">
            Plano atual: <span className="font-extrabold text-foreground">{access.plan === "pro" ? "Pro" : "Essencial"}</span>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
