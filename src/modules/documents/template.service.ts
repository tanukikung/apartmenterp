import { createHash } from 'node:crypto';
import { DocumentTemplateStatus, DocumentTemplateVersionStatus, type DocumentTemplateType, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { BadRequestError, ConflictError, NotFoundError } from '@/lib/utils/errors';
import { logAudit } from '@/modules/audit';
import { parseTemplateDocument, serializeTemplateDocument } from '@/lib/templates/document-template';
import { getTemplateFieldCatalog } from './field-catalog';
import { getDocumentResolverService } from './resolver.service';
import { renderTemplateHtml } from './render.service';
import { storeDocumentFile } from './storage.service';
import type {
  CreateTemplateInput,
  DocumentTemplateFieldResponse,
  DocumentTemplateResponse,
  DocumentTemplateVersionResponse,
  TemplateListQuery,
  TemplatePreviewRequest,
  UpdateTemplateInput,
} from './types';

function hashBody(body: string): string {
  return createHash('sha256').update(body).digest('hex');
}

function templateFilename(name: string, version: number, extension: string = 'html'): string {
  const safe = name.replace(/[^\w.\-]/g, '_').replace(/_+/g, '_');
  return `${safe || 'template'}_v${version}.${extension}`;
}

function mapTemplateVersion(version: Prisma.DocumentTemplateVersionGetPayload<{ include: { sourceFile: true } }>): DocumentTemplateVersionResponse {
  return {
    id: version.id,
    version: version.version,
    label: version.label,
    status: version.status,
    fileType: version.fileType,
    fileName: version.fileName,
    sourceFileId: version.sourceFileId,
    storageKey: version.storageKey,
    checksum: version.checksum,
    subject: version.subject,
    createdById: version.createdById,
    activatedById: version.activatedById,
    activatedAt: version.activatedAt,
    archivedAt: version.archivedAt,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
  };
}

function mapFieldDefinition(field: Prisma.DocumentTemplateFieldDefinitionGetPayload<Record<string, never>>): DocumentTemplateFieldResponse {
  return {
    id: field.id,
    key: field.key,
    label: field.label,
    category: field.category,
    valueType: field.valueType,
    path: field.path,
    description: field.description,
    isRequired: field.isRequired,
    isCollection: field.isCollection,
    sampleValue: field.sampleValue,
    sortOrder: field.sortOrder,
    metadata: field.metadata as Record<string, unknown> | null,
  };
}

function mapTemplate(
  template: Prisma.DocumentTemplateGetPayload<{
    include: {
      activeVersion: { include: { sourceFile: true } };
      versions: { include: { sourceFile: true } };
      fieldDefinitions: true;
    };
  }>,
): DocumentTemplateResponse {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    type: template.type,
    status: template.status,
    subject: template.subject,
    body: template.body,
    activeVersionId: template.activeVersionId,
    archivedAt: template.archivedAt,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    activeVersion: template.activeVersion ? mapTemplateVersion(template.activeVersion) : null,
    versions: template.versions.map(mapTemplateVersion),
    fields: template.fieldDefinitions.map(mapFieldDefinition),
  };
}

async function syncFieldDefinitions(templateId: string, type: DocumentTemplateType) {
  const catalog = getTemplateFieldCatalog(type);
  const existing = await prisma.documentTemplateFieldDefinition.findMany({
    where: { templateId },
  });

  for (const field of catalog) {
    // Use upsert so concurrent calls (e.g. React StrictMode double-invoke in dev)
    // do not race on the @@unique([templateId, key]) constraint causing P2002.
    await prisma.documentTemplateFieldDefinition.upsert({
      where: {
        templateId_key: { templateId, key: field.key },
      },
      create: {
        templateId,
        key: field.key,
        label: field.label,
        category: field.category,
        valueType: field.valueType,
        path: field.path,
        description: field.description,
        sampleValue: field.sampleValue,
        isRequired: field.isRequired,
        isCollection: field.isCollection,
        sortOrder: field.sortOrder,
        metadata: (field.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
      update: {
        label: field.label,
        category: field.category,
        valueType: field.valueType,
        path: field.path,
        description: field.description,
        sampleValue: field.sampleValue,
        isRequired: field.isRequired,
        isCollection: field.isCollection,
        sortOrder: field.sortOrder,
        metadata: (field.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    });
  }

  const allowedKeys = new Set(catalog.map((field) => field.key));
  const staleIds = existing.filter((field) => !allowedKeys.has(field.key)).map((field) => field.id);
  if (staleIds.length) {
    await prisma.documentTemplateFieldDefinition.deleteMany({
      where: {
        id: { in: staleIds },
      },
    });
  }
}

async function seedInitialVersion(templateId: string, uploadedBy?: string | null) {
  const template = await prisma.documentTemplate.findUnique({
    where: { id: templateId },
    include: {
      versions: true,
    },
  });
  if (!template) {
    throw new NotFoundError('DocumentTemplate', templateId);
  }
  if (template.versions.length > 0) {
    return template;
  }

  const normalizedBody = serializeTemplateDocument(parseTemplateDocument(template.body || '<p></p>'));
  const uploadedFile = await storeDocumentFile({
    keyPrefix: `document-templates/${template.id}/versions`,
    filename: templateFilename(template.name, 1),
    content: Buffer.from(normalizedBody, 'utf8'),
    mimeType: 'text/html; charset=utf-8',
    uploadedBy,
  });

  const version = await prisma.documentTemplateVersion.create({
    data: {
      templateId: template.id,
      version: 1,
      label: 'Initial version',
      subject: template.subject,
      body: normalizedBody,
      status: DocumentTemplateVersionStatus.ACTIVE,
      fileType: 'html',
      fileName: uploadedFile.originalName,
      storageKey: uploadedFile.storageKey,
      checksum: hashBody(normalizedBody),
      sourceFileId: uploadedFile.id,
      createdById: uploadedBy ?? null,
      activatedById: uploadedBy ?? null,
      activatedAt: new Date(),
    },
  });

  await prisma.documentTemplate.update({
    where: { id: template.id },
    data: {
      body: normalizedBody,
      activeVersionId: version.id,
      status: DocumentTemplateStatus.ACTIVE,
    },
  });

  await syncFieldDefinitions(template.id, template.type);
  return template;
}

export class DocumentTemplateService {
  async listTemplates(query: TemplateListQuery) {
    const where: Prisma.DocumentTemplateWhereInput = {};
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;

    const [data, total] = await Promise.all([
      prisma.documentTemplate.findMany({
        where,
        include: {
          activeVersion: {
            include: { sourceFile: true },
          },
          versions: {
            include: { sourceFile: true },
            orderBy: { version: 'desc' },
          },
          fieldDefinitions: {
            orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: query.pageSize,
      }),
      prisma.documentTemplate.count({ where }),
    ]);

    return {
      data: data.map(mapTemplate),
      total,
    };
  }

  async getTemplateById(id: string) {
    await seedInitialVersion(id);
    const template = await prisma.documentTemplate.findUnique({
      where: { id },
      include: {
        activeVersion: {
          include: { sourceFile: true },
        },
        versions: {
          include: { sourceFile: true },
          orderBy: { version: 'desc' },
        },
        fieldDefinitions: {
          orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
        },
      },
    });

    if (!template) {
      throw new NotFoundError('DocumentTemplate', id);
    }

    await syncFieldDefinitions(template.id, template.type);
    const refreshed = await prisma.documentTemplate.findUnique({
      where: { id },
      include: {
        activeVersion: {
          include: { sourceFile: true },
        },
        versions: {
          include: { sourceFile: true },
          orderBy: { version: 'desc' },
        },
        fieldDefinitions: {
          orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
        },
      },
    });

    if (!refreshed) {
      throw new NotFoundError('DocumentTemplate', id);
    }

    return mapTemplate(refreshed);
  }

  async createTemplate(input: CreateTemplateInput, actorId?: string | null) {
    const normalizedBody = serializeTemplateDocument(parseTemplateDocument(input.body));

    const created = await prisma.documentTemplate.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        type: input.type,
        subject: input.subject ?? null,
        body: normalizedBody,
        status: DocumentTemplateStatus.ACTIVE,
        createdById: actorId ?? null,
        updatedById: actorId ?? null,
      },
    });

    const uploadedFile = await storeDocumentFile({
      keyPrefix: `document-templates/${created.id}/versions`,
      filename: templateFilename(created.name, 1),
      content: Buffer.from(normalizedBody, 'utf8'),
      mimeType: 'text/html; charset=utf-8',
      uploadedBy: actorId ?? null,
    });

    const version = await prisma.documentTemplateVersion.create({
      data: {
        templateId: created.id,
        version: 1,
        label: 'Initial version',
        subject: input.subject ?? null,
        body: normalizedBody,
        status: DocumentTemplateVersionStatus.ACTIVE,
        fileType: 'html',
        fileName: uploadedFile.originalName,
        storageKey: uploadedFile.storageKey,
        checksum: hashBody(normalizedBody),
        sourceFileId: uploadedFile.id,
        createdById: actorId ?? null,
        activatedById: actorId ?? null,
        activatedAt: new Date(),
      },
    });

    await prisma.documentTemplate.update({
      where: { id: created.id },
      data: {
        activeVersionId: version.id,
        body: normalizedBody,
        subject: input.subject ?? null,
      },
    });

    await syncFieldDefinitions(created.id, created.type);

    await logAudit({
      actorId: actorId ?? 'system',
      actorRole: 'ADMIN',
      action: 'DOCUMENT_TEMPLATE_CREATED',
      entityType: 'DOCUMENT_TEMPLATE',
      entityId: created.id,
      metadata: {
        type: created.type,
        versionId: version.id,
      },
    });

    return this.getTemplateById(created.id);
  }

  async updateTemplate(id: string, input: UpdateTemplateInput, actorId?: string | null) {
    const existing = await prisma.documentTemplate.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundError('DocumentTemplate', id);
    }

    const nextStatus = input.archive
      ? DocumentTemplateStatus.ARCHIVED
      : input.status ?? existing.status;

    const updated = await prisma.documentTemplate.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description ?? null } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.subject !== undefined ? { subject: input.subject ?? null } : {}),
        status: nextStatus,
        archivedAt: nextStatus === DocumentTemplateStatus.ARCHIVED ? new Date() : null,
        updatedById: actorId ?? null,
      },
    });

    if (input.type && input.type !== existing.type) {
      await syncFieldDefinitions(updated.id, input.type);
    }

    await logAudit({
      actorId: actorId ?? 'system',
      actorRole: 'ADMIN',
      action: nextStatus === DocumentTemplateStatus.ARCHIVED ? 'DOCUMENT_TEMPLATE_ARCHIVED' : 'DOCUMENT_TEMPLATE_UPDATED',
      entityType: 'DOCUMENT_TEMPLATE',
      entityId: updated.id,
      metadata: {
        status: nextStatus,
        type: updated.type,
      },
    });

    return this.getTemplateById(updated.id);
  }

  async uploadTemplateVersion(id: string, file: File, actorId?: string | null) {
    // Templates are authored as HTML and edited in the built-in Tiptap editor.
    const fileNameLower = file.name.toLowerCase();
    if (!fileNameLower.endsWith('.html') && !fileNameLower.endsWith('.htm')) {
      throw new BadRequestError('Template upload currently supports HTML files only');
    }

    const template = await this.getTemplateById(id);
    const activeVersionNumber = template.versions?.[0]?.version ?? 0;
    const versionNumber = activeVersionNumber + 1;
    const contentBuffer = Buffer.from(await file.arrayBuffer());
    const body = serializeTemplateDocument(parseTemplateDocument(contentBuffer.toString('utf8')));
    const uploadedFile = await storeDocumentFile({
      keyPrefix: `document-templates/${id}/versions`,
      filename: file.name,
      content: Buffer.from(body, 'utf8'),
      mimeType: 'text/html; charset=utf-8',
      uploadedBy: actorId ?? null,
    });

    const version = await prisma.documentTemplateVersion.create({
      data: {
        templateId: id,
        version: versionNumber,
        label: `Upload v${versionNumber}`,
        subject: template.subject,
        body,
        status: DocumentTemplateVersionStatus.DRAFT,
        fileType: 'html',
        fileName: uploadedFile.originalName,
        storageKey: uploadedFile.storageKey,
        checksum: hashBody(body),
        sourceFileId: uploadedFile.id,
        createdById: actorId ?? null,
      },
    });

    await logAudit({
      actorId: actorId ?? 'system',
      actorRole: 'ADMIN',
      action: 'DOCUMENT_TEMPLATE_VERSION_UPLOADED',
      entityType: 'DOCUMENT_TEMPLATE_VERSION',
      entityId: version.id,
      metadata: {
        templateId: id,
        version: version.version,
        fileName: uploadedFile.originalName,
      },
    });

    return this.getTemplateById(id);
  }

  /**
   * Validates that a template version is ready to be published/activated.
   *
   * Rules:
   * - HTML body must have real content (≥10 chars).
   * - Version must have a stored source file.
   *
   * Returns { valid: true } or { valid: false, errors: string[] }.
   */
  async validateVersion(versionId: string): Promise<{ valid: true } | { valid: false; errors: string[] }> {
    const version = await prisma.documentTemplateVersion.findUnique({
      where: { id: versionId },
      include: { sourceFile: true },
    });
    if (!version) {
      return { valid: false, errors: ['Version not found'] };
    }

    const errors: string[] = [];

    if (!version.storageKey || !version.sourceFileId) {
      errors.push('No source file stored. Save the template before publishing.');
    }

    if (!version.body || version.body.trim().length < 10) {
      errors.push('Template body is empty. Add content before publishing.');
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }
    return { valid: true };
  }

  async activateVersion(templateId: string, versionId: string, actorId?: string | null) {
    const version = await prisma.documentTemplateVersion.findUnique({
      where: { id: versionId },
    });
    if (!version || version.templateId !== templateId) {
      throw new NotFoundError('DocumentTemplateVersion', versionId);
    }

    // Validate version is ready for publication
    const validation = await this.validateVersion(versionId);
    if (validation.valid === false) {
      throw new BadRequestError(
        `Cannot activate version: ${(validation as { valid: false; errors: string[] }).errors.join('; ')}`,
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.documentTemplateVersion.updateMany({
        where: {
          templateId,
          status: DocumentTemplateVersionStatus.ACTIVE,
        },
        data: {
          status: DocumentTemplateVersionStatus.ARCHIVED,
          archivedAt: new Date(),
        },
      });

      await tx.documentTemplateVersion.update({
        where: { id: versionId },
        data: {
          status: DocumentTemplateVersionStatus.ACTIVE,
          activatedAt: new Date(),
          activatedById: actorId ?? null,
          archivedAt: null,
        },
      });

      await tx.documentTemplate.update({
        where: { id: templateId },
        data: {
          activeVersionId: versionId,
          status: DocumentTemplateStatus.ACTIVE,
          body: version.body,
          subject: version.subject,
          archivedAt: null,
          updatedById: actorId ?? null,
        },
      });
    });

    await logAudit({
      actorId: actorId ?? 'system',
      actorRole: 'ADMIN',
      action: 'DOCUMENT_TEMPLATE_VERSION_ACTIVATED',
      entityType: 'DOCUMENT_TEMPLATE_VERSION',
      entityId: versionId,
      metadata: {
        templateId,
      },
    });

    return this.getTemplateById(templateId);
  }

  async createDraftVersionFromActive(templateId: string, actorId?: string | null) {
    const template = await this.getTemplateById(templateId);
    if (!template.activeVersion) {
      throw new ConflictError('Template does not have an active version to clone');
    }
    const nextVersion = Math.max(...(template.versions ?? []).map((version) => version.version), 0) + 1;
    const sourceBody = template.activeVersion ? template.body : '<p></p>';
    const uploadedFile = await storeDocumentFile({
      keyPrefix: `document-templates/${templateId}/versions`,
      filename: templateFilename(template.name, nextVersion),
      content: Buffer.from(sourceBody, 'utf8'),
      mimeType: 'text/html; charset=utf-8',
      uploadedBy: actorId ?? null,
    });

    const version = await prisma.documentTemplateVersion.create({
      data: {
        templateId,
        version: nextVersion,
        label: `Draft v${nextVersion}`,
        subject: template.subject,
        body: sourceBody,
        status: DocumentTemplateVersionStatus.DRAFT,
        fileType: 'html',
        fileName: uploadedFile.originalName,
        storageKey: uploadedFile.storageKey,
        checksum: hashBody(sourceBody),
        sourceFileId: uploadedFile.id,
        createdById: actorId ?? null,
      },
    });

    await logAudit({
      actorId: actorId ?? 'system',
      actorRole: 'ADMIN',
      action: 'DOCUMENT_TEMPLATE_VERSION_CREATED',
      entityType: 'DOCUMENT_TEMPLATE_VERSION',
      entityId: version.id,
      metadata: {
        templateId,
        version: version.version,
      },
    });

    return this.getTemplateById(templateId);
  }

  async getTemplateFields(templateId: string) {
    const template = await this.getTemplateById(templateId);
    return template.fields ?? [];
  }

  async getEditorVersion(templateId: string, versionId?: string, actorId?: string | null) {
    await seedInitialVersion(templateId, actorId ?? null);
    const template = await prisma.documentTemplate.findUnique({
      where: { id: templateId },
      include: {
        activeVersion: {
          include: { sourceFile: true },
        },
        versions: {
          include: { sourceFile: true },
          orderBy: [{ status: 'asc' }, { version: 'desc' }],
        },
      },
    });

    if (!template) {
      throw new NotFoundError('DocumentTemplate', templateId);
    }

    const selectedVersion =
      (versionId ? template.versions.find((version) => version.id === versionId) : null) ??
      template.versions.find((version) => version.status === DocumentTemplateVersionStatus.DRAFT) ??
      template.activeVersion ??
      template.versions[0] ??
      null;

    if (!selectedVersion) {
      throw new NotFoundError('DocumentTemplateVersion');
    }

    let sourceFile = selectedVersion.sourceFile;
    if (!sourceFile) {
      sourceFile = await storeDocumentFile({
        keyPrefix: `document-templates/${template.id}/versions`,
        filename: templateFilename(template.name, selectedVersion.version),
        content: Buffer.from(selectedVersion.body, 'utf8'),
        mimeType: 'text/html; charset=utf-8',
        uploadedBy: actorId ?? null,
      });
      await prisma.documentTemplateVersion.update({
        where: { id: selectedVersion.id },
        data: {
          sourceFileId: sourceFile.id,
          storageKey: sourceFile.storageKey,
          fileName: sourceFile.originalName,
          fileType: 'html',
        },
      });
    }

    return {
      template,
      version: {
        ...selectedVersion,
        sourceFile,
      },
    };
  }

  async previewTemplate(templateId: string, request: TemplatePreviewRequest, actorId?: string | null) {
    const template = await this.getTemplateById(templateId);
    const resolver = getDocumentResolverService();
    const context = await resolver.resolvePreviewContext(template.type, request, actorId ?? null);
    const rendered = renderTemplateHtml(template.body, context, template.fields ?? []);

    return {
      template,
      context,
      html: rendered.html,
      missingFields: rendered.missingFields,
    };
  }

  async getVersionContent(templateId: string, versionId: string): Promise<{ body: string; subject: string | null }> {
    const version = await prisma.documentTemplateVersion.findFirst({
      where: { id: versionId, templateId },
    });
    if (!version) {
      throw new NotFoundError('DocumentTemplateVersion', versionId);
    }
    return { body: version.body ?? '', subject: version.subject };
  }

  async updateVersionContent(
    templateId: string,
    versionId: string,
    body: string,
    subject: string | null,
  ): Promise<{ id: string; version: number }> {
    const normalizedBody = serializeTemplateDocument(parseTemplateDocument(body || '<p></p>'));
    const updated = await prisma.documentTemplateVersion.update({
      where: { id: versionId },
      data: {
        body: normalizedBody,
        subject: subject ?? undefined,
        checksum: hashBody(normalizedBody),
      },
      select: { id: true, version: true },
    });

    const template = await prisma.documentTemplate.findUnique({ where: { id: templateId } });
    if (template?.activeVersionId === versionId) {
      await prisma.documentTemplate.update({
        where: { id: templateId },
        data: { body: normalizedBody, subject: subject ?? undefined },
      });
    }

    return updated;
  }

  async uploadTemplateImage(templateId: string, file: File): Promise<{ url: string }> {
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadedFile = await storeDocumentFile({
      keyPrefix: `document-templates/${templateId}/images`,
      filename: file.name,
      content: buffer,
      mimeType: file.type,
    });
    return { url: uploadedFile.url };
  }
}

let templateService: DocumentTemplateService | null = null;

export function getDocumentTemplateService(): DocumentTemplateService {
  if (!templateService) {
    templateService = new DocumentTemplateService();
  }
  return templateService;
}
