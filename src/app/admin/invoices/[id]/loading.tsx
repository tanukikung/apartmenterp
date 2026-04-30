export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Back button */}
      <div className="h-5 w-24 bg-[hsl(var(--color-surface-hover))] rounded" />

      {/* Page title */}
      <div className="h-8 w-48 bg-[hsl(var(--color-surface-hover))] rounded-lg" />

      {/* Invoice detail cards */}
      <div className="grid gap-6">
        <div className="h-40 bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl" />
        <div className="h-64 bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl" />
      </div>
    </div>
  );
}
