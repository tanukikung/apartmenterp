import { describe, it, expect } from 'vitest';
import { LocalStorage } from '@/infrastructure/storage/localStorage';

describe('LocalStorage driver', () => {
  it('uploads, downloads, and deletes a file', async () => {
    const storage = new LocalStorage();
    const key = `test/${Date.now()}-hello.txt`;
    const content = Buffer.from('hello world', 'utf-8');
    const res = await storage.uploadFile({ key, content, contentType: 'text/plain' });
    expect(res.key).toBe(key);
    const dl = await storage.downloadFile(key);
    expect(dl.toString('utf-8')).toBe('hello world');
    await storage.deleteFile(key);
    await expect(storage.downloadFile(key)).rejects.toBeTruthy();
  });
});

