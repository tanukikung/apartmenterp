import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getStorage } from '@/infrastructure/storage';
import { LocalStorage } from '@/infrastructure/storage/localStorage';
import { S3Storage } from '@/infrastructure/storage/s3Storage';

const originalEnv = { ...process.env };

describe('storage factory', () => {
  beforeEach(() => {
    jestResetEnv();
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns LocalStorage by default', () => {
    delete process.env.STORAGE_DRIVER;
    const storage = getStorage();
    expect(storage).toBeInstanceOf(LocalStorage);
  });

  it('returns S3Storage when STORAGE_DRIVER=s3', () => {
    process.env.STORAGE_DRIVER = 's3';
    process.env.S3_BUCKET = 'test-bucket';
    const storage = getStorage();
    expect(storage).toBeInstanceOf(S3Storage);
  });
});

function jestResetEnv() {
  for (const k of Object.keys(process.env)) {
    if (k === 'NODE_ENV') continue;
    delete (process.env as any)[k];
  }
}

