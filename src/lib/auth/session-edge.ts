import { jwtVerify, SignJWT, JWTPayload } from 'jose';

export interface EdgeSessionPayload extends JWTPayload {
  sub: string;
  username: string;
  displayName: string;
  role: 'OWNER' | 'ADMIN' | 'STAFF';
  forcePasswordChange: boolean;
  buildingId: string | null; // Reserved for multi-building isolation (not yet enforced at API layer)
  version?: number;
  lastLoginAt?: string;
}

function getSecretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function verifySessionTokenEdge(
  token: string,
  secret: string
): Promise<EdgeSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(secret), {
      algorithms: ['HS256'],
    });
    const p = payload as EdgeSessionPayload;
    if (!p?.sub || !p?.role || !p?.exp) return null;
    if (typeof p.forcePasswordChange !== 'boolean') return null;
    if (p.exp * 1000 <= Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}

export async function signSessionTokenEdge(
  payload: Omit<EdgeSessionPayload, 'iat' | 'exp' | 'iss' | 'sub'>,
  secret: string
): Promise<string> {
  const token = await new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .setSubject(payload.sub as string)
    .sign(getSecretKey(secret));
  return token;
}

export async function refreshSessionEdgeIfNeeded(
  payload: EdgeSessionPayload,
  secret: string,
  refreshBeforeSecs = 60 * 5
): Promise<{ token: string; payload: EdgeSessionPayload } | null> {
  const nowMs = Date.now();
  const expMs = (payload.exp as number) * 1000;
  if (expMs <= nowMs) return null;
  if (expMs - nowMs > refreshBeforeSecs * 1000) return null;
  const refreshed: Omit<EdgeSessionPayload, 'iat' | 'exp' | 'iss' | 'sub'> = {
    username: payload.username,
    displayName: payload.displayName,
    role: payload.role,
    forcePasswordChange: payload.forcePasswordChange,
    buildingId: payload.buildingId,
    version: payload.version,
    lastLoginAt: payload.lastLoginAt,
  };
  const newToken = await signSessionTokenEdge(refreshed, secret);
  return {
    token: newToken,
    payload: { ...payload, exp: Math.floor(nowMs / 1000) + 60 * 60 * 12 },
  };
}