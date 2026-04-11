import { LocalStorage } from './localStorage';
import type { StorageDriver } from './types';
import { S3Storage } from './s3Storage';

class UnconfiguredStorage implements StorageDriver {
  async uploadFile(): Promise<never> {
    throw new Error('Storage driver not configured');
  }
  async downloadFile(): Promise<never> {
    throw new Error('Storage driver not configured');
  }
  async deleteFile(): Promise<never> {
    throw new Error('Storage driver not configured');
  }
  async copyFile(): Promise<never> {
    throw new Error('Storage driver not configured');
  }
}

export function getStorage(): StorageDriver {
  const driver = (process.env.STORAGE_DRIVER || 'local').toLowerCase();
  switch (driver) {
    case 'local':
      return new LocalStorage();
    case 's3':
      return new S3Storage();
    case 'supabase':
      return new UnconfiguredStorage();
    default:
      return new LocalStorage();
  }
}
