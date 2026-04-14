import { AppSidebar } from "@/components/app/app-sidebar";
import type { Profile } from "@/types/database";

type AppShellProps = {
  profile: Profile | null;
  children: React.ReactNode;
};

export function AppShell({ profile, children }: AppShellProps) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <AppSidebar profile={profile} />
      <main className="min-h-screen px-3 pb-28 pt-4 sm:px-6 md:pb-8 md:pl-[288px] md:pr-8 md:pt-6 lg:pr-10">
        <div className="mx-auto w-full max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
