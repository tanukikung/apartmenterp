export function daysSince(dateStr: string, now: Date = new Date()): number {
  const diff = now.getTime() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}
