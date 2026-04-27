import { createHash } from 'node:crypto';
import * as QRCode from 'qrcode';
import { DocumentTemplateStatus, DocumentTemplateVersionStatus, type DocumentTemplateType, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { BadRequestError, ConflictError, NotFoundError } from '@/lib/utils/errors';
import { logAudit } from '@/modules/audit';
import { parseTemplateDocument, serializeTemplateDocument } from '@/lib/templates/document-template';
import { getTemplateFieldCatalog } from './field-catalog';
import { getDocumentResolverService } from './resolver.service';
import { renderTemplateHtml } from './render.service';
import { storeDocumentFile } from './storage.service';
import { getStorage } from '@/infrastructure/storage';
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

  async duplicateTemplate(id: string, actorId?: string | null) {
    const existing = await prisma.documentTemplate.findUnique({
      where: { id },
      include: {
        versions: { orderBy: { version: 'desc' } },
        fieldDefinitions: true,
      },
    });
    if (!existing) {
      throw new NotFoundError('DocumentTemplate', id);
    }

    const latestVersion = existing.versions[0];
    const newName = `${existing.name} (คัดลอก)`;

    const newTemplate = await prisma.documentTemplate.create({
      data: {
        name: newName,
        description: existing.description,
        type: existing.type,
        subject: existing.subject,
        body: existing.body,
        status: existing.status,
        createdById: actorId ?? null,
        updatedById: actorId ?? null,
      },
    });

    const uploadedFile = await storeDocumentFile({
      keyPrefix: `document-templates/${newTemplate.id}/versions`,
      filename: templateFilename(newName, 1),
      content: Buffer.from(existing.body ?? '<p></p>', 'utf8'),
      mimeType: 'text/html; charset=utf-8',
      uploadedBy: actorId ?? null,
    });

    const newVersion = await prisma.documentTemplateVersion.create({
      data: {
        templateId: newTemplate.id,
        version: 1,
        label: latestVersion?.label ?? 'Initial version',
        subject: existing.subject,
        body: existing.body,
        status: DocumentTemplateVersionStatus.ACTIVE,
        fileType: latestVersion?.fileType ?? 'html',
        fileName: uploadedFile.originalName,
        storageKey: uploadedFile.storageKey,
        checksum: hashBody(existing.body ?? '<p></p>'),
        sourceFileId: uploadedFile.id,
        createdById: actorId ?? null,
        activatedById: actorId ?? null,
        activatedAt: new Date(),
      },
    });

    await prisma.documentTemplate.update({
      where: { id: newTemplate.id },
      data: { activeVersionId: newVersion.id },
    });

    // Duplicate field definitions
    if (existing.fieldDefinitions.length > 0) {
      await prisma.documentTemplateFieldDefinition.createMany({
        data: existing.fieldDefinitions.map((fd) => ({
          templateId: newTemplate.id,
          key: fd.key,
          label: fd.label,
          category: fd.category,
          valueType: fd.valueType,
          description: fd.description,
          path: fd.path,
          isCollection: fd.isCollection,
          isRequired: fd.isRequired,
          sampleValue: fd.sampleValue,
          sortOrder: fd.sortOrder,
          metadata: fd.metadata ?? undefined,
        })),
      });
    }

    await logAudit({
      actorId: actorId ?? 'system',
      actorRole: 'ADMIN',
      action: 'DOCUMENT_TEMPLATE_CREATED',
      entityType: 'DOCUMENT_TEMPLATE',
      entityId: newTemplate.id,
      metadata: {
        type: newTemplate.type,
        versionId: newVersion.id,
        duplicatedFrom: id,
      },
    });

    return this.getTemplateById(newTemplate.id);
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

    // Generate QR data URL for the preview — use emvQrPayload if available, otherwise qrPayload
    const qrPayload = context.computed.emvQrPayload ?? context.computed.qrPayload;
    let qrDataUrl = '';
    if (qrPayload) {
      try {
        qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 110, margin: 1 });
      } catch {
        qrDataUrl = '';
      }
    }

    // Inject qrDataUrl into computed so the template can use {{computed.qrDataUrl}} in <img src>
    const contextWithQr = {
      ...context,
      computed: {
        ...context.computed,
        qrDataUrl,
      },
    };

    const rendered = renderTemplateHtml(template.body, contextWithQr, template.fields ?? []);

    return {
      template,
      context: contextWithQr,
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

    // Sync image links so TemplateVersionImage records track what's in the HTML
    await this.syncVersionImages(versionId, normalizedBody);

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

    // Link to the active version (if one exists) via TemplateVersionImage
    const template = await prisma.documentTemplate.findUnique({ where: { id: templateId } });
    if (template?.activeVersionId) {
      await prisma.templateVersionImage.create({
        data: {
          versionId: template.activeVersionId,
          uploadedFileId: uploadedFile.id,
          imageUrl: uploadedFile.url,
        },
      });
    }

    return { url: uploadedFile.url };
  }

  /**
   * Sync image links for a version by extracting img src URLs from the body HTML.
   * Creates TemplateVersionImage records for any new URLs; URLs no longer in the
   * body are left alone (they may still be linked to other versions).
   */
  async syncVersionImages(versionId: string, bodyHtml: string): Promise<void> {
    const imgSrcMatches = bodyHtml.matchAll(/<img[^>]+src=["']([^"']+)["']/gi);
    const urlsInBody = new Set<string>();
    for (const match of imgSrcMatches) {
      urlsInBody.add(match[1]);
    }

    // Get currently linked UploadedFile IDs for this version
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore TemplateVersionImage not in generated client yet (pending prisma generate)
    const existing = await prisma.templateVersionImage.findMany({
      where: { versionId },
      include: { uploadedFile: true },
    });
    const existingUrls = new Set(existing.map((r) => r.imageUrl));

    // Add links for new URLs found in HTML
    for (const url of urlsInBody) {
      if (!existingUrls.has(url)) {
        // Find the UploadedFile that has this URL
        const uf = await prisma.uploadedFile.findFirst({ where: { url } });
        if (uf) {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          await prisma.templateVersionImage.create({
            data: {
              versionId,
              uploadedFileId: uf.id,
              imageUrl: url,
            },
          });
        }
      }
    }
  }

  /**
   * Returns all active images linked to a template's active version.
   */
  async getTemplateImages(templateId: string): Promise<Array<{
    id: string;
    imageUrl: string;
    originalName: string;
    mimeType: string;
    size: number;
    createdAt: Date;
  }>> {
    const template = await prisma.documentTemplate.findUnique({ where: { id: templateId } });
    if (!template?.activeVersionId) return [];

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const links = await prisma.templateVersionImage.findMany({
      where: {
        versionId: template.activeVersionId,
        uploadedFile: { status: 'ACTIVE' },
      },
      include: { uploadedFile: true },
    });

    return links.map((link) => ({
      id: link.uploadedFile.id,
      imageUrl: link.imageUrl,
      originalName: link.uploadedFile.originalName,
      mimeType: link.uploadedFile.mimeType,
      size: link.uploadedFile.size,
      createdAt: link.uploadedFile.createdAt,
    }));
  }

  /**
   * Returns images that are pending archive (soft-deleted trash) for a template.
   */
  async getTemplateTrashImages(templateId: string): Promise<Array<{
    id: string;
    imageUrl: string;
    originalName: string;
    mimeType: string;
    size: number;
    archivedAt: Date | null;
    versionId: string;
  }>> {
    const template = await prisma.documentTemplate.findUnique({ where: { id: templateId } });
    if (!template?.activeVersionId) return [];

    // All TemplateVersionImage records that point to PENDING_ARCHIVE uploaded files
    // for any version belonging to this template
    const versions = await prisma.documentTemplateVersion.findMany({
      where: { templateId },
      select: { id: true },
    });
    const versionIds = versions.map((v) => v.id);

    const trashLinks = await prisma.templateVersionImage.findMany({
      where: {
        versionId: { in: versionIds },
        uploadedFile: { status: 'PENDING_ARCHIVE' },
      },
      include: { uploadedFile: true },
    }); // eslint-disable-line @typescript-eslint/ban-ts-comment

    return trashLinks.map((link) => ({
      id: link.uploadedFile.id,
      imageUrl: link.imageUrl,
      originalName: link.uploadedFile.originalName,
      mimeType: link.uploadedFile.mimeType,
      size: link.uploadedFile.size,
      archivedAt: link.uploadedFile.archivedAt,
      versionId: link.versionId,
    }));
  }

  /**
   * Restore an image from trash (PENDING_ARCHIVE) back to ACTIVE.
   */
  async restoreTemplateImage(_templateId: string, imageId: string): Promise<void> {
    await prisma.uploadedFile.update({
      where: { id: imageId },
      data: { status: 'ACTIVE', archivedAt: null },
    });
  }

  /**
   * Move an image to trash — sets status to PENDING_ARCHIVE.
   * If the same UploadedFile is linked from multiple versions this only marks it
   * as pending; the actual file is deleted only when no version references it.
   */
  async archiveTemplateImage(_templateId: string, imageId: string): Promise<void> {
    await prisma.uploadedFile.update({
      where: { id: imageId },
      data: { status: 'PENDING_ARCHIVE', archivedAt: new Date() },
    });
  }

  /**
   * Immediately delete an image from storage and remove all DB records.
   */
  async forceDeleteTemplateImage(_templateId: string, imageId: string): Promise<void> {
    const uf = await prisma.uploadedFile.findUnique({ where: { id: imageId } });
    if (!uf) return;

    // Delete from storage
    try {
      const storage = getStorage();
      await storage.deleteFile(uf.storageKey);
    } catch {
      // Storage delete may fail if file doesn't exist — continue with DB cleanup
    }

    // Delete TemplateVersionImage links first
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    await prisma.templateVersionImage.deleteMany({ where: { uploadedFileId: imageId } });

    // Delete UploadedFile record
    await prisma.uploadedFile.delete({ where: { id: imageId } });
  }
}

let templateService: DocumentTemplateService | null = null;

export function getDocumentTemplateService(): DocumentTemplateService {
  if (!templateService) {
    templateService = new DocumentTemplateService();
  }
  return templateService;
}
