export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <div className="h-7 w-32 bg-[hsl(var(--color-surface-hover))] rounded-lg" />
          <div className="h-4 w-48 bg-[hsl(var(--color-surface-hover))] rounded" />
        </div>
        <div className="h-10 w-28 bg-[hsl(var(--color-surface-hover))] rounded-lg" />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl" />
        ))}
      </div>

      {/* Search */}
      <div className="flex gap-3 items-center">
        <div className="h-10 w-72 bg-[hsl(var(--color-surface-hover))] rounded-lg" />
        <div className="h-10 w-28 bg-[hsl(var(--color-surface-hover))] rounded-lg" />
      </div>

      {/* List */}
      <div className="border border-[hsl(var(--color-border))] rounded-xl overflow-hidden">
        {/* List header */}
        <div className="flex items-center gap-4 px-4 py-3 border-b border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]">
          <div className="h-4 w-48 bg-[hsl(var(--color-surface-hover))] rounded" />
          <div className="h-4 w-32 bg-[hsl(var(--color-surface-hover))] rounded" />
          <div className="h-4 w-40 bg-[hsl(var(--color-surface-hover))] rounded" />
          <div className="h-4 w-28 bg-[hsl(var(--color-surface-hover))] rounded" />
          <div className="flex-1" />
          <div className="h-4 w-20 bg-[hsl(var(--color-surface-hover))] rounded" />
        </div>
        {/* List rows */}
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4 border-b border-[hsl(var(--color-border))] last:border-0">
            {/* Avatar placeholder */}
            <div className="h-10 w-10 bg-[hsl(var(--color-surface-hover))] rounded-full shrink-0" />
            <div className="space-y-1.5 flex-1">
              <div className="h-4 w-40 bg-[hsl(var(--color-surface-hover))] rounded" />
              <div className="h-3 w-32 bg-[hsl(var(--color-surface-hover))] rounded" />
            </div>
            <div className="h-4 w-32 bg-[hsl(var(--color-surface-hover))] rounded" />
            <div className="h-4 w-40 bg-[hsl(var(--color-surface-hover))] rounded" />
            <div className="h-4 w-28 bg-[hsl(var(--color-surface-hover))] rounded" />
            <div className="flex-1" />
            <div className="h-6 w-6 bg-[hsl(var(--color-surface-hover))] rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}