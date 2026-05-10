type HeaderReader = {
  get(name: string): string | null;
};

function isUnroutableHost(host: string | null | undefined): boolean {
  if (!host) return true;
  const normalized = host.trim().toLowerCase();
  return (
    normalized === '0.0.0.0' ||
    normalized.startsWith('0.0.0.0:') ||
    normalized === '[::]' ||
    normalized.startsWith('[::]:')
  );
}

function parseOrigin(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function resolveBrowserOrigin(options: {
  requestUrl: string;
  headers: HeaderReader;
  configuredBaseUrl?: string | null;
}): string {
  const requestUrl = new URL(options.requestUrl);
  const configuredOrigin = parseOrigin(options.configuredBaseUrl);
  const host = options.headers.get('x-forwarded-host') || options.headers.get('host');
  const protocol =
    options.headers.get('x-forwarded-proto') || requestUrl.protocol.replace(/:$/, '');

  if (host && !isUnroutableHost(host)) {
    return `${protocol}://${host}`;
  }

  if (configuredOrigin) {
    return configuredOrigin;
  }

  if (!isUnroutableHost(requestUrl.host)) {
    return requestUrl.origin;
  }

  requestUrl.hostname = 'localhost';
  return requestUrl.origin;
}
