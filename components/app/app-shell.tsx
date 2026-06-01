import { AppSidebar } from "@/components/app/app-sidebar";
import { ProfileProvider } from "@/components/app/profile-provider";
import { RealtimeAppRefresh } from "@/components/app/realtime-app-refresh";
import { RouteWarmup } from "@/components/navigation/fast-navigation-link";
import { OnboardingTourProvider } from "@/components/onboarding/onboarding-tour";
import type { ObligationNotification } from "@/lib/obrigacoes/notifications";
import type { Profile } from "@/types/database";

type AppShellProps = {
  profile: Profile | null;
  children: React.ReactNode;
  isAdmin?: boolean;
  notifications?: ObligationNotification[];
};

const appWarmupRoutes = [
  "/app/dashboard",
  "/app/movimentacoes",
  "/app/importar",
  "/app/fechamento-mensal",
  "/app/relatorios",
  "/app/obrigacoes",
  "/app/agente",
  "/app/configuracoes",
];

export function AppShell({ profile, children, isAdmin = false, notifications = [] }: AppShellProps) {
  const warmupRoutes = isAdmin ? [...appWarmupRoutes, "/admin"] : appWarmupRoutes;

  return (
    <ProfileProvider profile={profile}>
      <OnboardingTourProvider completedAt={profile?.onboarding_tour_completed_at}>
        <div className="min-h-screen overflow-x-hidden bg-background md:bg-gradient-surface print:bg-white">
          <RouteWarmup routes={warmupRoutes} />
          <RealtimeAppRefresh userId={profile?.id ?? null} />
          <AppSidebar isAdmin={isAdmin} notifications={notifications} profile={profile} />
          <main className="min-h-screen px-4 pb-[calc(8.5rem+env(safe-area-inset-bottom))] pt-[8.5rem] sm:px-6 md:pb-10 md:pl-[296px] md:pt-7 lg:px-8 lg:pl-[304px] print:min-h-0 print:p-0">
            <div className="mx-auto w-full max-w-[1240px] print:max-w-none">{children}</div>
          </main>
        </div>
      </OnboardingTourProvider>
    </ProfileProvider>
  );
}
