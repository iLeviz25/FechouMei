import { RouteTransitionPending } from "@/components/app/route-transition-pending";

export default function AppLoading() {
  return (
    <div className="space-y-4">
      <RouteTransitionPending label="Carregando tela" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="h-24 rounded-[24px] bg-muted/60" />
        <div className="h-24 rounded-[24px] bg-muted/60" />
        <div className="h-24 rounded-[24px] bg-muted/60" />
        <div className="h-24 rounded-[24px] bg-muted/60" />
      </div>
      <div className="h-48 rounded-[28px] bg-muted/50" />
    </div>
  );
}
