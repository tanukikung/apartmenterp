import { createHash } from 'node:crypto';
import { ExternalServiceError } from '@/lib/utils/errors';
import {
  getOnlyOfficeDocumentServerUrl,
  isOnlyOfficeConfigured,
  signOnlyOfficeToken,
} from './index';

type ConvertRequestInput = {
  url: string;
  fileType: string;
  outputType: string;
  title: string;
  key: string;
};

type ConvertResponse = {
  error?: number;
  endConvert?: boolean;
  fileUrl?: string;
  url?: string;
};

function buildConvertRequest(input: ConvertRequestInput) {
  const payload = {
    async: false,
    filetype: input.fileType,
    outputtype: input.outputType,
    title: input.title,
    key: input.key,
    url: input.url,
  };
  const token = signOnlyOfficeToken(payload as unknown as Record<string, unknown>);
  return token ? { ...payload, token } : payload;
}

export function canConvertWithOnlyOffice(): boolean {
  return isOnlyOfficeConfigured();
}

export function createOnlyOfficeConversionKey(...parts: Array<string | number | Date>): string {
  const raw = parts
    .map((part) => (part instanceof Date ? String(part.getTime()) : String(part)))
    .join(':');
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

export async function convertOnlyOfficeDocument(input: ConvertRequestInput): Promise<Buffer> {
  if (!isOnlyOfficeConfigured()) {
    throw new ExternalServiceError('ONLYOFFICE', new Error('ONLYOFFICE is not configured'));
  }

  const endpoint = `${getOnlyOfficeDocumentServerUrl()}/converter`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildConvertRequest(input)),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new ExternalServiceError('ONLYOFFICE', new Error(`Conversion request failed with ${response.status}`));
  }

  const payload = (await response.json()) as ConvertResponse;
  if (payload.error) {
    throw new ExternalServiceError('ONLYOFFICE', new Error(`Conversion error code ${payload.error}`));
  }

  const downloadUrl = payload.fileUrl ?? payload.url;
  if (!downloadUrl || payload.endConvert === false) {
    throw new ExternalServiceError('ONLYOFFICE', new Error('Document conversion did not return a downloadable file'));
  }

  const converted = await fetch(downloadUrl, { cache: 'no-store' });
  if (!converted.ok) {
    throw new ExternalServiceError('ONLYOFFICE', new Error(`Converted file download failed with ${converted.status}`));
  }

  const arrayBuffer = await converted.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
