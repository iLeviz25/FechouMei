import { AppSidebar } from "@/components/app/app-sidebar";
import { ProfileProvider } from "@/components/app/profile-provider";
import { RealtimeAppRefresh } from "@/components/app/realtime-app-refresh";
import type { Profile } from "@/types/database";

type AppShellProps = {
  profile: Profile | null;
  children: React.ReactNode;
};

export function AppShell({ profile, children }: AppShellProps) {
  return (
    <ProfileProvider profile={profile}>
      <div className="min-h-screen overflow-x-hidden bg-gradient-surface">
        <RealtimeAppRefresh userId={profile?.id ?? null} />
        <AppSidebar profile={profile} />
        <main className="min-h-screen px-4 pb-28 pt-20 sm:px-6 md:pb-8 md:pl-[296px] md:pt-6 lg:px-8 lg:pl-[304px]">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </ProfileProvider>
  );
}
