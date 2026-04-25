import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { getObligationNotificationsForUser } from "@/lib/obrigacoes/notifications";
import { getCurrentUserProfile } from "@/lib/profile";

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

  const notifications = await getObligationNotificationsForUser({
    monthKey: getCurrentMonthKey(),
    supabase,
    userId: user.id,
  });

  return <AppShell isAdmin={profile.role === "admin"} notifications={notifications} profile={profile}>{children}</AppShell>;
}
