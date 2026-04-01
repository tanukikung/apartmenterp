import fs from 'node:fs/promises';
import path from 'node:path';
import { type StorageDriver, type UploadParams, type UploadResult } from './types';
import { resolveUploadDir } from '@/lib/runtime-paths';

function baseDir(): string {
  return resolveUploadDir();
}

function safeJoin(base: string, key: string): string {
  const normalized = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/g, '');
  return path.join(base, normalized);
}

async function ensureDirFor(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

export class LocalStorage implements StorageDriver {
  async uploadFile(params: UploadParams): Promise<UploadResult> {
    const b = baseDir();
    const dest = safeJoin(b, params.key);
    await ensureDirFor(dest);
    await fs.writeFile(dest, params.content);
    return { key: params.key, url: undefined };
  }

  async downloadFile(key: string): Promise<Buffer> {
    const dest = safeJoin(baseDir(), key);
    return fs.readFile(dest);
  }

  async deleteFile(key: string): Promise<void> {
    const dest = safeJoin(baseDir(), key);
    await fs.rm(dest, { force: true });
  }
}
