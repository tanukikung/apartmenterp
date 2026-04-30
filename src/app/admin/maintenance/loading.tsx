export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-[hsl(var(--color-surface-hover))] rounded-lg" />
      <div className="h-4 w-64 bg-[hsl(var(--color-surface-hover))] rounded" />
      <div className="h-[400px] bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl" />
    </div>
  );
}
