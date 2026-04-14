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
      <main className="min-h-screen px-4 pb-28 pt-5 sm:px-6 md:pb-10 md:pl-[280px] md:pr-8 md:pt-8 lg:pr-12">
        <div className="mx-auto w-full max-w-6xl animate-fade-in">{children}</div>
      </main>
    </div>
  );
}
