export function RouteTransitionPending({ label = "Carregando" }: { label?: string }) {
  return (
    <div aria-live="polite" className="py-1" role="status">
      <span className="sr-only">{label}</span>
      <div className="h-1 overflow-hidden rounded-full bg-neutral-100">
        <div className="h-full w-1/3 rounded-full bg-emerald-200" />
      </div>
    </div>
  );
}
