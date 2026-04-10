export default function Loading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <div className="relative flex h-14 w-14 items-center justify-center">
        <div className="absolute h-full w-full rounded-full border-4 border-[var(--primary)]/20" />
        <div className="absolute h-full w-full rounded-full border-4 border-transparent border-t-[var(--primary)] animate-spin" />
      </div>
      <p className="text-sm text-[var(--on-surface-variant)] animate-pulse">กำลังโหลด...</p>
    </div>
  );
}
