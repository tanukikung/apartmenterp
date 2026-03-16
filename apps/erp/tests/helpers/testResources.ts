type CleanupFn = () => void | Promise<void>;

const registry: CleanupFn[] = [];

export function registerTestCleanup(fn: CleanupFn): void {
  registry.push(fn);
}

export async function runRegisteredCleanups(): Promise<void> {
  while (registry.length) {
    const fn = registry.pop();
    try {
      await fn?.();
    } catch {
      // ignore
    }
  }
}

