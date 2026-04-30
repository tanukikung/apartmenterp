export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <div className="h-7 w-32 bg-[hsl(var(--color-surface-hover))] rounded-lg" />
          <div className="h-4 w-48 bg-[hsl(var(--color-surface-hover))] rounded" />
        </div>
        <div className="h-10 w-36 bg-[hsl(var(--color-surface-hover))] rounded-lg" />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl" />
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[hsl(var(--color-border))] pb-px">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-8 w-20 bg-[hsl(var(--color-surface-hover))] rounded" />
        ))}
      </div>

      {/* Table */}
      <div className="border border-[hsl(var(--color-border))] rounded-xl overflow-hidden">
        {/* Table header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]">
          <div className="h-4 w-32 bg-[hsl(var(--color-surface-hover))] rounded" />
          <div className="h-4 w-24 bg-[hsl(var(--color-surface-hover))] rounded" />
          <div className="h-4 w-28 bg-[hsl(var(--color-surface-hover))] rounded" />
          <div className="h-4 w-28 bg-[hsl(var(--color-surface-hover))] rounded" />
          <div className="h-4 w-20 bg-[hsl(var(--color-surface-hover))] rounded" />
          <div className="h-4 w-20 bg-[hsl(var(--color-surface-hover))] rounded" />
          <div className="h-4 w-24 bg-[hsl(var(--color-surface-hover))] rounded" />
          <div className="flex-1" />
          <div className="h-4 w-16 bg-[hsl(var(--color-surface-hover))] rounded" />
        </div>
        {/* Table rows */}
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-4 border-b border-[hsl(var(--color-border))] last:border-0">
            <div className="h-4 w-32 bg-[hsl(var(--color-surface-hover))] rounded" />
            <div className="h-4 w-24 bg-[hsl(var(--color-surface-hover))] rounded" />
            <div className="space-y-1">
              <div className="h-4 w-28 bg-[hsl(var(--color-surface-hover))] rounded" />
              <div className="h-3 w-20 bg-[hsl(var(--color-surface-hover))] rounded" />
            </div>
            <div className="h-4 w-28 bg-[hsl(var(--color-surface-hover))] rounded" />
            <div className="h-6 w-20 bg-[hsl(var(--color-surface-hover))] rounded-full" />
            <div className="h-6 w-16 bg-[hsl(var(--color-surface-hover))] rounded-full" />
            <div className="h-4 w-24 bg-[hsl(var(--color-surface-hover))] rounded" />
            <div className="flex-1" />
            <div className="h-8 w-8 bg-[hsl(var(--color-surface-hover))] rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}