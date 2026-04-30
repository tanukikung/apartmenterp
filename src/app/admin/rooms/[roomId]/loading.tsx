export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Back button */}
      <div className="h-5 w-24 bg-[hsl(var(--color-surface-hover))] rounded" />

      {/* Page title */}
      <div className="h-8 w-48 bg-[hsl(var(--color-surface-hover))] rounded-lg" />

      {/* Tab navigation */}
      <div className="flex gap-4 border-b border-[hsl(var(--color-border))] pb-4">
        <div className="h-6 w-20 bg-[hsl(var(--color-surface-hover))] rounded" />
        <div className="h-6 w-20 bg-[hsl(var(--color-surface-hover))] rounded" />
        <div className="h-6 w-20 bg-[hsl(var(--color-surface-hover))] rounded" />
        <div className="h-6 w-20 bg-[hsl(var(--color-surface-hover))] rounded" />
      </div>

      {/* Content area */}
      <div className="grid gap-6">
        <div className="h-48 bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl" />
        <div className="h-32 bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl" />
      </div>
    </div>
  );
}
