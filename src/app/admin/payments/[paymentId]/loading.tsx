export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Back button */}
      <div className="h-5 w-24 bg-[hsl(var(--color-surface-hover))] rounded" />

      {/* Page title */}
      <div className="h-8 w-48 bg-[hsl(var(--color-surface-hover))] rounded-lg" />

      {/* Payment detail card */}
      <div className="h-48 bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl" />

      {/* Related items table skeleton */}
      <div className="h-64 bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl" />
    </div>
  );
}
