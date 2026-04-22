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
        <main className="min-h-screen px-3.5 pb-32 pt-[4.75rem] sm:px-6 md:pb-10 md:pl-[296px] md:pt-7 lg:px-8 lg:pl-[304px]">
          <div className="mx-auto w-full max-w-[1240px]">{children}</div>
        </main>
      </div>
    </ProfileProvider>
  );
}
