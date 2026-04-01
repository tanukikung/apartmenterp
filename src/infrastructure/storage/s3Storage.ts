import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import type { StorageDriver, UploadParams, UploadResult } from './types';
import { Readable } from 'node:stream';

function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.once('end', () => resolve(Buffer.concat(chunks)));
    stream.once('error', reject);
  });
}

export interface S3Config {
  bucket: string;
  region?: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  credentials?: { accessKeyId: string; secretAccessKey: string };
}

export class S3Storage implements StorageDriver {
  private client: S3Client;
  private bucket: string;

  constructor(config?: Partial<S3Config>, client?: S3Client) {
    const bucket = config?.bucket || process.env.S3_BUCKET || '';
    if (!bucket) {
      throw new Error('S3_BUCKET is required for S3 storage');
    }
    this.bucket = bucket;
    this.client =
      client ||
      new S3Client({
        region: config?.region || process.env.S3_REGION,
        endpoint: process.env.S3_ENDPOINT || config?.endpoint,
        forcePathStyle:
          String(process.env.S3_FORCE_PATH_STYLE || '').toLowerCase() === 'true' ||
          Boolean(config?.forcePathStyle),
        credentials: config?.credentials,
      });
  }

  async uploadFile(params: UploadParams): Promise<UploadResult> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      Body: params.content,
      ContentType: params.contentType,
    });
    await this.client.send(command);
    return { key: params.key };
  }

  async downloadFile(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const res = await this.client.send(command);
    const body = res.Body;
    if (!body) {
      throw new Error('Empty S3 object body');
    }
    if (Buffer.isBuffer(body)) return body;
    if (body instanceof Readable) return streamToBuffer(body);
    // In some runtimes, Body can be a different stream-like object with transformToByteArray
    const anyBody = body as unknown as { transformToByteArray?: () => Promise<Uint8Array> };
    if (anyBody.transformToByteArray) {
      const arr = await anyBody.transformToByteArray();
      return Buffer.from(arr);
    }
    throw new Error('Unsupported S3 body type');
  }

  async deleteFile(key: string): Promise<void> {
    const command = new DeleteObjectCommand({ Bucket: this.bucket, Key: key });
    await this.client.send(command);
  }
}

