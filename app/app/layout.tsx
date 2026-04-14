import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { getCurrentUserProfile } from "@/lib/profile";

export default async function AuthenticatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { profile, profileError, user } = await getCurrentUserProfile();

  if (!user) {
    redirect("/login");
  }

  if (profileError) {
    throw new Error(`Erro ao carregar perfil: ${profileError.message}`);
  }

  if (!profile?.onboarding_completed) {
    redirect("/onboarding");
  }

  return <AppShell profile={profile}>{children}</AppShell>;
}
