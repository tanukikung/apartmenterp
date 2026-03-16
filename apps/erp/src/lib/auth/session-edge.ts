export interface EdgeSessionPayload {
  sub: string;
  username: string;
  displayName: string;
  role: 'ADMIN' | 'STAFF';
  forcePasswordChange: boolean;
  exp: number;
}

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  return atob(padded);
}

function encodeBase64Url(input: ArrayBuffer): string {
  const bytes = new Uint8Array(input);
  let str = '';
  bytes.forEach((byte) => {
    str += String.fromCharCode(byte);
  });
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function verifySessionTokenEdge(token: string, secret: string): Promise<EdgeSessionPayload | null> {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encodedPayload));
  const expected = encodeBase64Url(signatureBuffer);
  if (expected !== signature) return null;

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as EdgeSessionPayload;
    if (!payload?.sub || !payload?.role || !payload?.exp || typeof payload.forcePasswordChange !== 'boolean') return null;
    if (payload.exp * 1000 <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
