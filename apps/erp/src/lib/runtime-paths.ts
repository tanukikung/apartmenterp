import path from 'node:path';

function appDataRoot(): string {
  return process.env.APP_DATA_DIR || path.join(process.cwd(), '.data');
}

export function resolveUploadDir(): string {
  return process.env.UPLOAD_DIR || path.join(appDataRoot(), 'uploads');
}

export function resolveBackupDir(): string {
  return process.env.BACKUP_DIR || path.join(appDataRoot(), 'backups');
}
