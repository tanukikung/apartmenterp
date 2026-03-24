import { prisma } from '@/lib';
import { getStorage } from '@/infrastructure/storage';
import { createOnlyOfficeDocumentKey, getOnlyOfficeCallbackBaseUrl, inferOnlyOfficeDocumentType } from './index';
import { NotFoundError, ExternalServiceError } from '@/lib/utils/errors';
import { buildFileAccessUrl } from '@/lib/files/access';

export function getOnlyOfficeTemplateStorageKey(templateId: string): string {
  return `onlyoffice/templates/${templateId}.html`;
}

/**
 * Build the URL that ONLYOFFICE Document Server uses to fetch the file.
 * Must use ONLYOFFICE_CALLBACK_BASE_URL (e.g. http://host.docker.internal:3001)
 * rather than APP_BASE_URL (localhost) so Docker-hosted ONLYOFFICE can reach
 * the file endpoint on the Windows/host machine.
 */
export function getOnlyOfficeFileUrl(storageKey: string): string {
  return buildFileAccessUrl(storageKey, {
    absoluteBaseUrl: getOnlyOfficeCallbackBaseUrl(),
    inline: true,
    signed: true,
    expiresInSeconds: 15 * 60,
  });
}

export function getFileExtension(filename: string): string {
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/i);
  return match?.[1] ?? 'bin';
}

export async function syncTemplateDocumentToStorage(templateId: string) {
  const template = await prisma.documentTemplate.findUnique({
    where: { id: templateId },
  });
  if (!template) {
    throw new NotFoundError('DocumentTemplate', templateId);
  }

  const storageKey = getOnlyOfficeTemplateStorageKey(template.id);
  const storage = getStorage();
  const body = (template.body || '<p></p>').trim();
  await storage.uploadFile({
    key: storageKey,
    content: Buffer.from(body, 'utf8'),
    contentType: 'text/html; charset=utf-8',
  });

  return {
    template,
    storageKey,
    fileType: 'html',
    documentType: inferOnlyOfficeDocumentType('html'),
    documentUrl: getOnlyOfficeFileUrl(storageKey),
    key: createOnlyOfficeDocumentKey('template', template.id, template.updatedAt),
  };
}

export async function getStoredWorkbookForBatch(batchId: string) {
  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId },
  });
  if (!batch) {
    throw new NotFoundError('ImportBatch', batchId);
  }

  // ImportBatch.filename is the source filename
  const fileType = getFileExtension(batch.filename);

  return {
    batch,
    fileType,
    documentType: inferOnlyOfficeDocumentType(fileType),
    documentUrl: '',
    key: createOnlyOfficeDocumentKey('billing-batch', batch.id, batch.createdAt),
  };
}

export async function downloadOnlyOfficeCallbackFile(url: string): Promise<Buffer> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new ExternalServiceError('ONLYOFFICE', new Error(`Document server returned ${response.status}`));
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
