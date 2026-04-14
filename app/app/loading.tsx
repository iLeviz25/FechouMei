export default function AppLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="rounded-lg border bg-white p-4">
        <div className="h-5 w-24 rounded-md bg-neutral-200" />
        <div className="mt-4 h-8 w-48 rounded-md bg-neutral-200" />
        <div className="mt-3 h-4 w-full max-w-md rounded-md bg-neutral-100" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div className="h-32 rounded-lg border bg-white" key={item} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="h-72 rounded-lg border bg-neutral-900" />
        <div className="h-72 rounded-lg border bg-white" />
      </div>
    </div>
  );
}
