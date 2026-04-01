// Re-export S3Client from AWS SDK for use in dynamic imports.
// Usage: const { S3Client } = await import('@/lib/s3/client');
//        const client = new S3Client({ region, credentials });
export { S3Client as S3Client } from '@aws-sdk/client-s3';
