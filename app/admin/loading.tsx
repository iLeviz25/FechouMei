import { RouteTransitionPending } from "@/components/app/route-transition-pending";

export default function AdminLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <RouteTransitionPending label="Carregando painel admin" />
        <div className="h-8 w-48 rounded-2xl bg-muted/60" />
        <div className="h-4 w-full max-w-md rounded-full bg-muted/50" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="h-28 rounded-[26px] bg-muted/55" />
        <div className="h-28 rounded-[26px] bg-muted/55" />
        <div className="h-28 rounded-[26px] bg-muted/55" />
        <div className="h-28 rounded-[26px] bg-muted/55" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="h-64 rounded-[26px] bg-muted/45" />
        <div className="h-64 rounded-[26px] bg-muted/45" />
      </div>
    </div>
  );
}
