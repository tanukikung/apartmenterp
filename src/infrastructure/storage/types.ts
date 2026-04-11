export interface UploadParams {
  key: string;
  content: Buffer;
  contentType: string;
}

export interface UploadResult {
  key: string;
  url?: string;
}

export interface StorageDriver {
  uploadFile(params: UploadParams): Promise<UploadResult>;
  downloadFile(key: string): Promise<Buffer>;
  deleteFile(key: string): Promise<void>;
  copyFile(src: string, dest: string): Promise<void>;
}

