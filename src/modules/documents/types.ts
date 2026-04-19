import { z } from 'zod';
import {
  DocumentTemplateType,
  DocumentTemplateStatus,
  DocumentTemplateVersionStatus,
  DocumentSourceScope,
  GeneratedDocumentStatus,
  DocumentFieldCategory,
  DocumentFieldValueType,
  GeneratedDocumentFileRole,
} from '@prisma/client';

export type { GeneratedDocumentStatus } from '@prisma/client';

export const documentTemplateTypeSchema = z.nativeEnum(DocumentTemplateType);
export const documentTemplateStatusSchema = z.nativeEnum(DocumentTemplateStatus);
export const documentTemplateVersionStatusSchema = z.nativeEnum(DocumentTemplateVersionStatus);
export const documentSourceScopeSchema = z.nativeEnum(DocumentSourceScope);
export const generatedDocumentStatusSchema = z.nativeEnum(GeneratedDocumentStatus);
export const documentFieldCategorySchema = z.nativeEnum(DocumentFieldCategory);
export const documentFieldValueTypeSchema = z.nativeEnum(DocumentFieldValueType);
export const generatedDocumentFileRoleSchema = z.nativeEnum(GeneratedDocumentFileRole);

export const createTemplateSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(1000).optional().nullable(),
  type: documentTemplateTypeSchema.default(DocumentTemplateType.INVOICE),
  subject: z.string().trim().max(500).optional().nullable(),
  body: z.string().min(1).max(200_000).default('<p></p>'),
});

export const updateTemplateSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  type: documentTemplateTypeSchema.optional(),
  subject: z.string().trim().max(500).optional().nullable(),
  status: documentTemplateStatusSchema.optional(),
  archive: z.boolean().optional(),
});

export const activateTemplateVersionSchema = z.object({
  versionId: z.string().min(1),
});

export const templatePreviewRequestSchema = z.object({
  roomId: z.string().optional(),
  billingCycleId: z.string().optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  useSampleData: z.boolean().default(false),
});

export const templateListQuerySchema = z.object({
  type: documentTemplateTypeSchema.optional(),
  status: documentTemplateStatusSchema.optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const documentGenerateSchema = z.object({
  templateId: z.string().min(1),
  templateVersionId: z.string().min(1).optional(),
  billingCycleId: z.string().optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  scope: documentSourceScopeSchema,
  roomId: z.string().optional(),
  roomIds: z.array(z.string()).default([]),
  floorNumber: z.coerce.number().int().min(1).max(200).optional(),
  onlyOccupiedRooms: z.boolean().default(false),
  onlyRoomsWithBillingRecord: z.boolean().default(false),
  dryRun: z.boolean().default(false),
  includeZipBundle: z.boolean().default(false),
});

export const documentListQuerySchema = z.object({
  templateId: z.string().optional(),
  status: generatedDocumentStatusSchema.optional(),
  type: documentTemplateTypeSchema.optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  roomId: z.string().optional(),
  billingCycleId: z.string().optional(),
  q: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
export type ActivateTemplateVersionInput = z.infer<typeof activateTemplateVersionSchema>;
export type TemplatePreviewRequest = z.infer<typeof templatePreviewRequestSchema>;
export type TemplateListQuery = z.infer<typeof templateListQuerySchema>;
export type DocumentGenerateInput = z.infer<typeof documentGenerateSchema>;
export type DocumentListQuery = z.infer<typeof documentListQuerySchema>;

export interface DocumentTemplateFieldResponse {
  id?: string;
  key: string;
  label: string;
  category: DocumentFieldCategory;
  valueType: DocumentFieldValueType;
  path: string;
  description: string | null;
  isRequired: boolean;
  isCollection: boolean;
  sampleValue: string | null;
  sortOrder: number;
  metadata?: Record<string, unknown> | null;
}

export interface DocumentTemplateVersionResponse {
  id: string;
  version: number;
  label: string | null;
  status: DocumentTemplateVersionStatus;
  fileType: string;
  fileName: string | null;
  sourceFileId: string | null;
  storageKey: string | null;
  checksum: string | null;
  subject: string | null;
  createdById: string | null;
  activatedById: string | null;
  activatedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentTemplateResponse {
  id: string;
  name: string;
  description: string | null;
  type: DocumentTemplateType;
  status: DocumentTemplateStatus;
  subject: string | null;
  body: string;
  activeVersionId: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  activeVersion?: DocumentTemplateVersionResponse | null;
  versions?: DocumentTemplateVersionResponse[];
  fields?: DocumentTemplateFieldResponse[];
}

export interface DocumentGenerationPreviewTarget {
  roomId: string;
  roomNumber: string;
  floorNumber: number | null;
  tenantName: string | null;
  billingRecordId: string | null;
  invoiceId: string | null;
  status: 'READY' | 'SKIPPED' | 'FAILED';
  reason: string | null;
}

export interface DocumentGenerationPreviewResponse {
  templateId: string;
  templateVersionId: string;
  scope: DocumentSourceScope;
  totalRequested: number;
  readyCount: number;
  skippedCount: number;
  failedCount: number;
  targets: DocumentGenerationPreviewTarget[];
}

export interface GeneratedDocumentFileResponse {
  id: string;
  role: GeneratedDocumentFileRole;
  format: string;
  isPrimary: boolean;
  uploadedFileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
  storageKey: string;
  createdAt: Date;
}

export interface GeneratedDocumentResponse {
  id: string;
  title: string;
  subject: string | null;
  status: GeneratedDocumentStatus;
  documentType: DocumentTemplateType;
  documentVersion: number;
  sourceScope: DocumentSourceScope;
  year: number | null;
  month: number | null;
  generatedAt: Date;
  template: {
    id: string;
    name: string;
  };
  templateVersion: {
    id: string;
    version: number;
    label: string | null;
  };
  room: {
    id: string;
    roomNumber: string;
    floorNumber: number | null;
  };
  tenantName: string | null;
  billingCycleId: string | null;
  billingRecordId: string | null;
  invoiceId: string | null;
  files: GeneratedDocumentFileResponse[];
  renderContext?: Record<string, unknown> | null;
  validation?: Record<string, unknown> | null;
  auditTrail?: Array<{
    id: string;
    action: string;
    userName: string;
    createdAt: Date;
    details?: Record<string, unknown> | null;
  }>;
}

export interface DocumentGenerationJobResponse {
  id: string;
  templateId: string;
  templateVersionId: string;
  scope: DocumentSourceScope;
  status: string;
  totalRequested: number;
  successCount: number;
  skippedCount: number;
  failedCount: number;
  billingCycleId: string | null;
  year: number | null;
  month: number | null;
  bundleUrl: string | null;
  targets: Array<{
    id: string;
    roomId: string;
    roomNumber: string;
    floorNumber: number | null;
    tenantName: string | null;
    status: string;
    reason: string | null;
    generatedDocumentId: string | null;
  }>;
}
