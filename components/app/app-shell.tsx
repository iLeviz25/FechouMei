import { AppSidebar } from "@/components/app/app-sidebar";
import { ProfileProvider } from "@/components/app/profile-provider";
import { RealtimeAppRefresh } from "@/components/app/realtime-app-refresh";
import type { ObligationNotification } from "@/lib/obrigacoes/notifications";
import type { Profile } from "@/types/database";

type AppShellProps = {
  profile: Profile | null;
  children: React.ReactNode;
  isAdmin?: boolean;
  notifications?: ObligationNotification[];
};

export function AppShell({ profile, children, isAdmin = false, notifications = [] }: AppShellProps) {
  return (
    <ProfileProvider profile={profile}>
      <div className="min-h-screen overflow-x-hidden bg-gradient-surface print:bg-white">
        <RealtimeAppRefresh userId={profile?.id ?? null} />
        <AppSidebar isAdmin={isAdmin} notifications={notifications} profile={profile} />
        <main className="min-h-screen px-4 pb-32 pt-[5rem] sm:px-6 md:pb-10 md:pl-[296px] md:pt-7 lg:px-8 lg:pl-[304px] print:min-h-0 print:p-0">
          <div className="mx-auto w-full max-w-[1240px] print:max-w-none">{children}</div>
        </main>
      </div>
    </ProfileProvider>
  );
}
