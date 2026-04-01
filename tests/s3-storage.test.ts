import { describe, it, expect, vi } from 'vitest';
import { S3Storage } from '@/infrastructure/storage/s3Storage';
import { Readable } from 'node:stream';
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

class FakeS3Client {
  public sent: unknown[] = [];
  async send(command: unknown): Promise<any> {
    this.sent.push(command);
    if (command instanceof GetObjectCommand) {
      const stream = Readable.from(Buffer.from('hello world', 'utf-8'));
      return { Body: stream };
    }
    return {};
  }
}

describe('S3Storage', () => {
  it('uploads, downloads, and deletes using S3 client', async () => {
    const client = new FakeS3Client() as any;
    const storage = new S3Storage({ bucket: 'test-bucket' }, client);
    const key = `test/${Date.now()}-hello.txt`;
    const content = Buffer.from('hello!', 'utf-8');

    const up = await storage.uploadFile({ key, content, contentType: 'text/plain' });
    expect(up.key).toBe(key);
    expect(client.sent[0]).toBeInstanceOf(PutObjectCommand);

    const buf = await storage.downloadFile(key);
    expect(buf.toString('utf-8')).toBe('hello world');
    expect(client.sent[1]).toBeInstanceOf(GetObjectCommand);

    await storage.deleteFile(key);
    expect(client.sent[2]).toBeInstanceOf(DeleteObjectCommand);
  });
});

