import JSZip from 'jszip';
import { DocumentSourceScope, DocumentTemplateType, GeneratedDocumentFileRole, DocumentTemplateVersionStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { BadRequestError, NotFoundError, ValidationError } from '@/lib/utils/errors';
import { logAudit } from '@/modules/audit';
import { getDocumentTemplateService } from './template.service';
import { getDocumentResolverService, type ResolvedDocumentTarget } from './resolver.service';
import { renderTemplateHtml } from './render.service';
import { generateDocumentPdf } from './pdf.service';
import { storeDocumentFile } from './storage.service';
import { getStorage } from '@/infrastructure/storage';
import type { GeneratedDocumentStatus } from './types';
import type {
  DocumentGenerateInput,
  DocumentGenerationJobResponse,
  DocumentGenerationPreviewResponse,
  DocumentListQuery,
  GeneratedDocumentFileResponse,
  GeneratedDocumentResponse,
} from './types';

function generatedTitle(templateName: string, roomNumber: string, year?: number | null, month?: number | null): string {
  if (year && month) {
    return `${templateName} - Room ${roomNumber} - ${year}-${String(month).padStart(2, '0')}`;
  }
  return `${templateName} - Room ${roomNumber}`;
}

function mimeExtFromRole(role: GeneratedDocumentFileRole): string {
  switch (role) {
    case GeneratedDocumentFileRole.PDF:
      return 'pdf';
    case GeneratedDocumentFileRole.DOCX:
      return 'docx';
    case GeneratedDocumentFileRole.ZIP_BUNDLE:
      return 'zip';
    default:
      return 'html';
  }
}

function mapGeneratedFile(
  file: Prisma.GeneratedDocumentFileGetPayload<{
    include: { uploadedFile: true };
  }>,
): GeneratedDocumentFileResponse {
  return {
    id: file.id,
    role: file.role,
    format: file.format,
    isPrimary: file.isPrimary,
    uploadedFileId: file.uploadedFileId,
    fileName: file.uploadedFile.originalName,
    mimeType: file.uploadedFile.mimeType,
    size: file.uploadedFile.size,
    url: file.uploadedFile.url,
    storageKey: file.uploadedFile.storageKey,
    createdAt: file.createdAt,
  };
}

function mapGeneratedDocument(
  document: Prisma.GeneratedDocumentGetPayload<{
    include: {
      template: true;
      templateVersion: true;
      room: true;
      tenant: true;
      files: { include: { uploadedFile: true } };
    };
  }>,
  auditTrail?: Array<{
    id: string;
    action: string;
    userName: string;
    createdAt: Date;
    details: Prisma.JsonValue | null;
  }>,
): GeneratedDocumentResponse {
  return {
    id: document.id,
    title: document.title,
    subject: document.subject,
    status: document.status as GeneratedDocumentStatus,
    documentType: document.documentType,
    documentVersion: document.documentVersion,
    sourceScope: document.sourceScope,
    year: document.year,
    month: document.month,
    generatedAt: document.generatedAt,
    template: {
      id: document.template.id,
      name: document.template.name,
    },
    templateVersion: {
      id: document.templateVersion.id,
      version: document.templateVersion.version,
      label: document.templateVersion.label,
    },
    room: {
      id: document.room.roomNo,
      roomNumber: document.room.roomNo,
      floorNumber: document.room.floorNo,
    },
    tenantName: document.tenant ? `${document.tenant.firstName} ${document.tenant.lastName}`.trim() : null,
    billingCycleId: document.billingPeriodId,
    billingRecordId: document.roomBillingId,
    invoiceId: document.invoiceId,
    files: document.files.map(mapGeneratedFile),
    renderContext: document.renderContext as Record<string, unknown> | null,
    validation: document.validation as Record<string, unknown> | null,
    auditTrail: auditTrail?.map((entry) => ({
      id: entry.id,
      action: entry.action,
      userName: entry.userName,
      createdAt: entry.createdAt,
      details: entry.details as Record<string, unknown> | null,
    })),
  };
}

export class DocumentGenerationService {
  private async getResolvedTemplate(templateId: string, templateVersionId?: string) {
    const templateService = getDocumentTemplateService();
    const template = await templateService.getTemplateById(templateId);
    const resolvedVersionId = templateVersionId ?? template.activeVersionId;
    if (!resolvedVersionId) {
      throw new ValidationError('Template does not have an active version');
    }

    const version = await prisma.documentTemplateVersion.findUnique({
      where: { id: resolvedVersionId },
    });
    if (!version || version.templateId !== templateId) {
      throw new NotFoundError('DocumentTemplateVersion', resolvedVersionId);
    }

    // Only ACTIVE (published) template versions may be used for generation.
    // DRAFT versions are still being edited and must not be used to produce customer documents.
    if (version.status !== DocumentTemplateVersionStatus.ACTIVE) {
      throw new ValidationError(
        `Template version v${version.version} is ${version.status}. Only ACTIVE (published) versions can be used to generate documents. Please activate this version first.`,
      );
    }

    return {
      template,
      version,
    };
  }

  async previewGeneration(input: DocumentGenerateInput, actorId?: string | null): Promise<DocumentGenerationPreviewResponse> {
    const resolvedTemplate = await this.getResolvedTemplate(input.templateId, input.templateVersionId);
    const template = resolvedTemplate.template;
    const resolver = getDocumentResolverService();
    const targets = await resolver.resolveTargets(input, template.type, actorId ?? null);

    const previewTargets = targets.map((target) => {
      const rendered = renderTemplateHtml(resolvedTemplate.version.body, target.context, template.fields ?? []);
      const billingRequired = (template.type === DocumentTemplateType.INVOICE || template.type === DocumentTemplateType.PAYMENT_NOTICE || template.type === DocumentTemplateType.RECEIPT)
        && !target.billingRecordId;

      if (billingRequired) {
        return {
          roomId: target.roomId,
          roomNumber: target.roomNumber,
          floorNumber: target.floorNumber,
          tenantName: target.tenantName,
          billingRecordId: target.billingRecordId,
          invoiceId: target.invoiceId,
          status: 'FAILED' as const,
          reason: 'No billing record found for the selected month/cycle',
        };
      }

      if (rendered.missingFields.length > 0) {
        return {
          roomId: target.roomId,
          roomNumber: target.roomNumber,
          floorNumber: target.floorNumber,
          tenantName: target.tenantName,
          billingRecordId: target.billingRecordId,
          invoiceId: target.invoiceId,
          status: 'FAILED' as const,
          reason: rendered.missingFields.map((field) => field.message).join('; '),
        };
      }

      return {
        roomId: target.roomId,
        roomNumber: target.roomNumber,
        floorNumber: target.floorNumber,
        tenantName: target.tenantName,
        billingRecordId: target.billingRecordId,
        invoiceId: target.invoiceId,
        status: 'READY' as const,
        reason: null,
      };
    });

    return {
      templateId: input.templateId,
      templateVersionId: resolvedTemplate.version.id,
      scope: input.scope,
      totalRequested: previewTargets.length,
      readyCount: previewTargets.filter((target) => target.status === 'READY').length,
      skippedCount: previewTargets.filter((target) => (target.status as string) === 'SKIPPED').length,
      failedCount: previewTargets.filter((target) => target.status === 'FAILED').length,
      targets: previewTargets,
    };
  }

  private async createJob(templateId: string, templateVersionId: string, input: DocumentGenerateInput, preview: DocumentGenerationPreviewResponse, actorId?: string | null) {
    return prisma.documentGenerationJob.create({
      data: {
        templateId,
        templateVersionId,
        requestedById: actorId ?? null,
        billingPeriodId: input.billingCycleId ?? null,
        year: input.year ?? null,
        month: input.month ?? null,
        scope: input.scope,
        selection: {
          roomNo: input.roomId ?? null,
          roomIds: input.roomIds,
          floorNumber: input.floorNumber ?? null,
          onlyOccupiedRooms: input.onlyOccupiedRooms,
          onlyRoomsWithBillingRecord: input.onlyRoomsWithBillingRecord,
        },
        dryRun: false,
        status: 'RUNNING',
        totalRequested: preview.totalRequested,
      },
    });
  }

  private async determineDocumentVersion(templateId: string, roomNo: string, year?: number | null, month?: number | null) {
    const latest = await prisma.generatedDocument.findFirst({
      where: {
        templateId,
        roomNo,
        year: year ?? null,
        month: month ?? null,
      },
      orderBy: { documentVersion: 'desc' },
    });
    return latest ? latest.documentVersion + 1 : 1;
  }

  private async convertHtmlOutputs(
    _htmlFileUrl: string,
    title: string,
    _keyBase: string,
    html: string,
  ) {
    const pdfBuffer = Buffer.from(await generateDocumentPdf(title, html));
    return { pdfBuffer, docxBuffer: null };
  }

  private async persistGeneratedFiles(
    generatedDocumentId: string,
    title: string,
    html: string,
    actorId?: string | null,
    year?: number | null,
    month?: number | null,
    roomNo?: string | null,
  ) {
    const keyPrefix = (year && month && roomNo)
      ? `documents/${year}/${String(month).padStart(2, '0')}/${roomNo}`
      : `generated-documents/${generatedDocumentId}`;

    const sourceFile = await storeDocumentFile({
      keyPrefix,
      filename: `${title}.html`,
      content: Buffer.from(html, 'utf8'),
      mimeType: 'text/html; charset=utf-8',
      uploadedBy: actorId ?? null,
    });

    const { pdfBuffer, docxBuffer } = await this.convertHtmlOutputs(
      sourceFile.url,
      title,
      generatedDocumentId,
      html,
    );

    const pdfFile = await storeDocumentFile({
      keyPrefix,
      filename: `${title}.pdf`,
      content: pdfBuffer,
      mimeType: 'application/pdf',
      uploadedBy: actorId ?? null,
    });

    const createdFiles = await prisma.$transaction(async (tx) => {
      const files = [
        await tx.generatedDocumentFile.create({
          data: {
            generatedDocumentId,
            uploadedFileId: sourceFile.id,
            role: GeneratedDocumentFileRole.SOURCE_HTML,
            format: 'html',
            isPrimary: false,
          },
          include: { uploadedFile: true },
        }),
        await tx.generatedDocumentFile.create({
          data: {
            generatedDocumentId,
            uploadedFileId: pdfFile.id,
            role: GeneratedDocumentFileRole.PDF,
            format: 'pdf',
            isPrimary: true,
          },
          include: { uploadedFile: true },
        }),
      ];

      if (docxBuffer) {
        const docxFile = await storeDocumentFile({
          keyPrefix: `generated-documents/${generatedDocumentId}`,
          filename: `${title}.docx`,
          content: docxBuffer,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          uploadedBy: actorId ?? null,
        });
        files.push(
          await tx.generatedDocumentFile.create({
            data: {
              generatedDocumentId,
              uploadedFileId: docxFile.id,
              role: GeneratedDocumentFileRole.DOCX,
              format: 'docx',
              isPrimary: false,
            },
            include: { uploadedFile: true },
          }),
        );
      }

      return files;
    });

    return {
      files: createdFiles,
      pdfBuffer,
    };
  }

  private async createGeneratedDocumentRecord(
    templateId: string,
    templateVersionId: string,
    input: DocumentGenerateInput,
    target: ResolvedDocumentTarget,
    html: string,
    actorId?: string | null,
  ) {
    const template = await prisma.documentTemplate.findUnique({
      where: { id: templateId },
    });
    if (!template) {
      throw new NotFoundError('DocumentTemplate', templateId);
    }

    const version = await this.determineDocumentVersion(
      templateId,
      target.roomId,
      target.context.billing?.year ?? input.year ?? null,
      target.context.billing?.month ?? input.month ?? null,
    );

    const document = await prisma.generatedDocument.create({
      data: {
        templateId,
        templateVersionId,
        documentType: template.type,
        status: 'GENERATED',
        title: generatedTitle(template.name, target.roomNumber, target.context.billing?.year ?? input.year, target.context.billing?.month ?? input.month),
        subject: template.subject,
        sourceScope: input.scope,
        roomNo: target.roomId,
        billingPeriodId: target.context.billing?.billingCycleId ?? input.billingCycleId ?? null,
        roomBillingId: target.billingRecordId,
        invoiceId: target.invoiceId,
        contractId: target.context.contract?.id ?? null,
        tenantId: target.context.tenant?.id ?? null,
        year: target.context.billing?.year ?? input.year ?? null,
        month: target.context.billing?.month ?? input.month ?? null,
        documentVersion: version,
        generatedById: actorId ?? null,
        renderContext: target.context as any as Prisma.InputJsonValue,
        validation: { htmlLength: html.length } as any as Prisma.InputJsonValue,
      },
    });

    return document;
  }

  async generateDocuments(input: DocumentGenerateInput, actorId?: string | null) {
    const resolvedTemplate = await this.getResolvedTemplate(input.templateId, input.templateVersionId);
    const template = resolvedTemplate.template;
    const templateVersionId = resolvedTemplate.version.id;

    const preview = await this.previewGeneration(input, actorId);
    const job = await this.createJob(template.id, templateVersionId, input, preview, actorId);

    await logAudit({
      actorId: actorId ?? 'system',
      actorRole: 'ADMIN',
      action: 'DOCUMENT_GENERATION_REQUESTED',
      entityType: 'DOCUMENT_GENERATION_JOB',
      entityId: job.id,
      metadata: {
        templateId: template.id,
        templateVersionId,
        scope: input.scope,
        totalRequested: preview.totalRequested,
      },
    });

    const previewByRoomId = new Map(preview.targets.map((target) => [target.roomId, target]));
    const resolver = getDocumentResolverService();
    const resolvedTargets = await resolver.resolveTargets(input, template.type, actorId ?? null);

    const bundle = new JSZip();
    let successCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let bundleFileCount = 0;
    const MAX_ZIP_BUNDLE_SIZE = 500; // Prevent memory exhaustion for large batches

    for (const target of resolvedTargets) {
      const targetPreview = previewByRoomId.get(target.roomId);
      const targetRow = await prisma.documentGenerationTarget.create({
        data: {
          jobId: job.id,
          roomNo: target.roomId,
          roomBillingId: target.billingRecordId,
          invoiceId: target.invoiceId,
          contractId: target.context.contract?.id ?? null,
          tenantId: target.context.tenant?.id ?? null,
          status: 'PENDING',
          reason: targetPreview?.reason ?? null,
          renderSummary: {
            roomNumber: target.roomNumber,
            tenantName: target.tenantName,
          },
        },
      });

      if (targetPreview?.status !== 'READY') {
        skippedCount += 1;
        await prisma.documentGenerationTarget.update({
          where: { id: targetRow.id },
          data: {
            status: targetPreview?.status === 'FAILED' ? 'FAILED' : 'SKIPPED',
            reason: targetPreview?.reason ?? 'Skipped by preview validation',
          },
        });
        if (targetPreview?.status === 'FAILED') {
          failedCount += 1;
        }
        continue;
      }

      try {
        const rendered = renderTemplateHtml(resolvedTemplate.version.body, target.context, template.fields ?? []);
        if (rendered.missingFields.length > 0) {
          throw new ValidationError(rendered.missingFields.map((field) => field.message).join('; '));
        }

        const document = await this.createGeneratedDocumentRecord(
          template.id,
          templateVersionId,
          input,
          target,
          rendered.html,
          actorId,
        );

        await logAudit({
          actorId: actorId ?? 'system',
          actorRole: 'ADMIN',
          action: 'GENERATED_DOCUMENT_CREATED',
          entityType: 'GENERATED_DOCUMENT',
          entityId: document.id,
          metadata: {
            templateId: template.id,
            templateVersionId,
            roomId: target.roomId,
            billingRecordId: target.billingRecordId,
          },
        });

        const title = document.title.replace(/[^\w.\-]/g, '_');
        const persisted = await this.persistGeneratedFiles(
          document.id,
          title,
          rendered.html,
          actorId,
          document.year,
          document.month,
          document.roomNo,
        );
        const primaryPdf = persisted.files.find((file) => file.role === GeneratedDocumentFileRole.PDF);
        if (input.includeZipBundle && primaryPdf) {
          if (bundleFileCount < MAX_ZIP_BUNDLE_SIZE) {
            bundle.file(`${title}.${mimeExtFromRole(primaryPdf.role)}`, persisted.pdfBuffer);
            bundleFileCount++;
          }
        }

        await prisma.documentGenerationTarget.update({
          where: { id: targetRow.id },
          data: {
            status: 'SUCCESS',
            generatedDocumentId: document.id,
          },
        });

        successCount += 1;
      } catch (error) {
        failedCount += 1;
        await prisma.documentGenerationTarget.update({
          where: { id: targetRow.id },
          data: {
            status: 'FAILED',
            reason: error instanceof Error ? error.message : 'Generation failed',
          },
        });
      }
    }

    let bundleUrl: string | null = null;
    if (input.includeZipBundle && successCount > 0) {
      const bundleBuffer = await bundle.generateAsync({ type: 'nodebuffer' });
      const uploaded = await storeDocumentFile({
        keyPrefix: `generated-documents/${job.id}`,
        filename: `document_bundle_${job.id}.zip`,
        content: bundleBuffer,
        mimeType: 'application/zip',
        uploadedBy: actorId ?? null,
      });

      await prisma.documentGenerationJob.update({
        where: { id: job.id },
        data: {
          bundleFileId: uploaded.id,
        },
      });
      bundleUrl = uploaded.url;
    }

    const finalStatus =
      failedCount > 0 && successCount > 0
        ? 'PARTIAL'
        : failedCount > 0 && successCount === 0
          ? 'FAILED'
          : 'COMPLETED';

    await prisma.documentGenerationJob.update({
      where: { id: job.id },
      data: {
        status: finalStatus,
        successCount,
        skippedCount,
        failedCount,
        completedAt: new Date(),
      },
    });

    await logAudit({
      actorId: actorId ?? 'system',
      actorRole: 'ADMIN',
      action: 'DOCUMENT_GENERATION_COMPLETED',
      entityType: 'DOCUMENT_GENERATION_JOB',
      entityId: job.id,
      metadata: {
        templateId: template.id,
        templateVersionId,
        scope: input.scope,
        successCount,
        skippedCount,
        failedCount,
      },
    });

    return this.getJobById(job.id, bundleUrl);
  }

  async listDocuments(query: DocumentListQuery) {
    const where: Prisma.GeneratedDocumentWhereInput = {};
    if (query.templateId) where.templateId = query.templateId;
    if (query.status) where.status = query.status;
    if (query.type) where.documentType = query.type;
    if (query.roomId) where.roomNo = query.roomId;
    if (query.billingCycleId) where.billingPeriodId = query.billingCycleId;
    if (query.year) where.year = query.year;
    if (query.month) where.month = query.month;

    const [total, documents] = await Promise.all([
      prisma.generatedDocument.count({ where }),
      prisma.generatedDocument.findMany({
        where,
        include: {
          template: true,
          templateVersion: true,
          room: true,
          tenant: true,
          files: {
            include: {
              uploadedFile: true,
            },
          },
        },
        orderBy: { generatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      data: documents.map((document) => mapGeneratedDocument(document)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async getDocumentById(id: string) {
    const [document, auditTrail] = await Promise.all([
      prisma.generatedDocument.findUnique({
        where: { id },
        include: {
          template: true,
          templateVersion: true,
          room: true,
          tenant: true,
          files: {
            include: {
              uploadedFile: true,
            },
          },
        },
      }),
      prisma.auditLog.findMany({
        where: {
          entityType: 'GENERATED_DOCUMENT',
          entityId: id,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    if (!document) {
      throw new NotFoundError('GeneratedDocument', id);
    }

    return mapGeneratedDocument(document, auditTrail);
  }

  async getJobById(id: string, bundleOverride?: string | null): Promise<DocumentGenerationJobResponse> {
    const job = await prisma.documentGenerationJob.findUnique({
      where: { id },
      include: {
        bundleFile: true,
        targets: {
          include: {
            room: true,
            tenant: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!job) {
      throw new NotFoundError('DocumentGenerationJob', id);
    }

    return {
      id: job.id,
      templateId: job.templateId,
      templateVersionId: job.templateVersionId,
      scope: job.scope,
      status: job.status,
      totalRequested: job.totalRequested,
      successCount: job.successCount,
      skippedCount: job.skippedCount,
      failedCount: job.failedCount,
      billingCycleId: job.billingPeriodId,
      year: job.year,
      month: job.month,
      bundleUrl: bundleOverride ?? job.bundleFile?.url ?? null,
      targets: job.targets.map((target) => ({
        id: target.id,
        roomId: target.roomNo,
        roomNumber: target.room.roomNo,
        floorNumber: target.room.floorNo,
        tenantName: target.tenant ? `${target.tenant.firstName} ${target.tenant.lastName}`.trim() : null,
        status: target.status,
        reason: target.reason,
        generatedDocumentId: target.generatedDocumentId,
      })),
    };
  }

  async regenerateDocument(documentId: string, actorId?: string | null) {
    const existing = await prisma.generatedDocument.findUnique({
      where: { id: documentId },
    });

    if (!existing) {
      throw new NotFoundError('GeneratedDocument', documentId);
    }

    if (existing.status === 'SENT') {
      throw new BadRequestError('Cannot regenerate a document that has already been sent. Create a new document instead.');
    }
    // Allow regenerating FAILED documents so they can be retried

    const input: DocumentGenerateInput = {
      templateId: existing.templateId,
      templateVersionId: existing.templateVersionId,
      billingCycleId: existing.billingPeriodId ?? undefined,
      year: existing.year ?? undefined,
      month: existing.month ?? undefined,
      scope: DocumentSourceScope.SINGLE_ROOM,
      roomId: existing.roomNo,
      roomIds: [],
      floorNumber: undefined,
      onlyOccupiedRooms: false,
      onlyRoomsWithBillingRecord: false,
      dryRun: false,
      includeZipBundle: false,
    };

    await logAudit({
      actorId: actorId ?? 'system',
      actorRole: 'ADMIN',
      action: 'GENERATED_DOCUMENT_REGENERATE_REQUESTED',
      entityType: 'GENERATED_DOCUMENT',
      entityId: documentId,
      metadata: {
        templateId: existing.templateId,
        templateVersionId: existing.templateVersionId,
      },
    });

    return this.generateDocuments(input, actorId);
  }

  async deleteDocument(id: string, actorId?: string | null): Promise<void> {
    const document = await prisma.generatedDocument.findUnique({
      where: { id },
      include: { files: { include: { uploadedFile: true } } },
    });

    if (!document) {
      throw new NotFoundError('GeneratedDocument', id);
    }

    const storage = getStorage();
    for (const file of document.files) {
      try {
        await storage.deleteFile(file.uploadedFile.storageKey);
      } catch {
        // File may already be deleted
      }
    }

    await prisma.generatedDocument.delete({ where: { id } });

    await logAudit({
      actorId: actorId ?? 'system',
      actorRole: 'ADMIN',
      action: 'GENERATED_DOCUMENT_DELETED',
      entityType: 'GeneratedDocument',
      entityId: id,
      metadata: { title: document.title, roomNo: document.roomNo },
    });
  }
}

let generationService: DocumentGenerationService | null = null;

export function getDocumentGenerationService(): DocumentGenerationService {
  if (!generationService) {
    generationService = new DocumentGenerationService();
  }
  return generationService;
}
