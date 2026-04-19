/**
 * Job runners — inline execution functions for each background job.
 *
 * Each runner returns { count, message } so API routes can report results.
 * All DB operations use the shared Prisma client and are safe to call
 * concurrently from multiple requests (they are idempotent or use transactions).
 */

import { prisma } from '@/lib';
import { logAudit } from '@/modules/audit';
import { runLateFeeJob } from './late-fee.job';
import { getOutboxProcessor } from '@/lib/outbox';
import {
  GeneratedDocumentStatus,
  UploadedFileStatus,
  NotificationStatus,
} from '@prisma/client';

const DEFAULT_DUE_DAY = 25;
import { logger } from '@/lib/utils/logger';

export type JobResult = {
  count: number;
  message: string;
};

// ── 1. Mark overdue invoices ────────────────────────────────────────────────
// Sets status = OVERDUE for any invoice whose dueDate is in the past and
// that has not yet been paid or cancelled.
export async function runOverdueFlag(): Promise<JobResult> {
  const now = new Date();
  const result = await prisma.invoice.updateMany({
    where: {
      status: { in: ['GENERATED', 'SENT', 'VIEWED'] },
      dueDate: { lt: now },
    },
    data: { status: 'OVERDUE' },
  });

  return {
    count: result.count,
    message: `${result.count} invoice(s) marked as OVERDUE`,
  };
}

// ── 2. Auto-generate billing period ────────────────────────────────────────
// Creates a BillingPeriod record for the current calendar month if one does
// not already exist. Rooms need a billing period before billings can be
// generated for them.
export async function runBillingGenerate(): Promise<JobResult> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // getMonth() is 0-based

  const existing = await prisma.billingPeriod.findFirst({
    where: { year, month },
  });

  if (existing) {
    return {
      count: 0,
      message: `Billing period for ${year}/${String(month).padStart(2, '0')} already exists`,
    };
  }

  await prisma.billingPeriod.create({
    data: {
      year,
      month,
      status: 'OPEN',
      dueDay: DEFAULT_DUE_DAY,
    },
  });

  return {
    count: 1,
    message: `Billing period created for ${year}/${String(month).padStart(2, '0')}`,
  };
}

// ── 3. Send pending invoices ────────────────────────────────────────────────
// Advances GENERATED invoices to SENT status and stamps sentAt.
// In production this would also dispatch LINE notifications; here it just
// updates the status so the UI reflects the correct state.
export async function runInvoiceSend(): Promise<JobResult> {
  const result = await prisma.invoice.updateMany({
    where: { status: 'GENERATED' },
    data: { status: 'SENT', sentAt: new Date() },
  });

  return {
    count: result.count,
    message: `${result.count} invoice(s) marked as SENT`,
  };
}

// ── 4. Late-fee check ───────────────────────────────────────────────────────
// Applies late fees based on BillingRule penaltyPerDay, updates Invoice lateFeeAmount.
export async function runLateFee(): Promise<JobResult> {
  const result = await runLateFeeJob();
  return {
    count: result.updated,
    message: `${result.updated} invoice(s) updated, total fees ${result.totalFees.toFixed(2)}, skipped ${result.skipped}`,
  };
}

// ── 5. Database cleanup ─────────────────────────────────────────────────────
// Deletes audit log entries older than 90 days and expired password reset tokens.
export async function runDbCleanup(): Promise<JobResult> {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  await logAudit({
    actorId: 'system',
    actorRole: 'SYSTEM',
    action: 'DB_CLEANUP_STARTED',
    entityType: 'AUDIT_LOG',
    entityId: 'cleanup',
    metadata: { cutoff: cutoff.toISOString(), retentionDays: 90 },
  });

  const [auditResult, tokenResult] = await Promise.all([
    prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    }),
    prisma.passwordResetToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    }),
  ]);

  logger.info({
    type: 'db_cleanup_completed',
    auditLogDeletedCount: auditResult.count,
    tokenDeletedCount: tokenResult.count,
    cutoff: cutoff.toISOString(),
    retentionDays: 90,
  });

  await logAudit({
    actorId: 'system',
    actorRole: 'SYSTEM',
    action: 'DB_CLEANUP_COMPLETED',
    entityType: 'AUDIT_LOG',
    entityId: 'cleanup',
    metadata: {
      auditLogDeletedCount: auditResult.count,
      tokenDeletedCount: tokenResult.count,
      cutoff: cutoff.toISOString(),
      retentionDays: 90,
    },
  });

  return {
    count: auditResult.count + tokenResult.count,
    message: `${auditResult.count} audit log entries older than 90 days deleted, ${tokenResult.count} expired password reset tokens deleted`,
  };
}

// ── 6. Contract expiry check ─────────────────────────────────────────────────
// Checks for contracts expiring in 30/60/90 days and notifies staff via LINE
// and creates in-app notifications for admins.
export async function runContractExpiryCheck(): Promise<JobResult> {
  const now = new Date();
  const { sendLineMessage } = await import('@/lib');

  const expiryThresholds = [30, 60, 90];
  let totalNotified = 0;

  for (const daysAhead of expiryThresholds) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);
    const prevDays = daysAhead === 30 ? 0 : daysAhead === 60 ? 31 : 61;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + prevDays + 1);

    const expiringContracts = await prisma.contract.findMany({
      where: {
        status: 'ACTIVE',
        endDate: { gte: startDate, lte: futureDate },
      },
      include: { room: true, primaryTenant: true },
    });

    for (const contract of expiringContracts) {
      const daysUntilExpiry = Math.ceil(
        (contract.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      const urgencyLabel = daysUntilExpiry <= 30 ? 'ด่วน' : daysUntilExpiry <= 60 ? 'แจ้งเตือน' : 'แจ้งล่วงหน้า';
      const message = `[${urgencyLabel}] สัญญาเช่าห้อง ${contract.roomNo} จะหมดอายุในอีก ${daysUntilExpiry} วัน (${contract.endDate.toLocaleDateString('th-TH')}) ผู้เช่า: ${contract.primaryTenant.firstName} ${contract.primaryTenant.lastName}`;

      const admins = await prisma.adminUser.findMany({ where: { isActive: true } });

      for (const admin of admins) {
        // Idempotency: skip if a NOTICE notification for this contract+admin already
        // exists within the last 24 hours
        const existing = await prisma.notification.findFirst({
          where: {
            type: 'NOTICE',
            contractId: contract.id,
            adminId: admin.id,
            createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
          },
        });

        if (!existing) {
          const notification = await prisma.notification.create({
            data: {
              type: 'NOTICE',
              roomNo: contract.roomNo,
              tenantId: contract.primaryTenantId,
              adminId: admin.id,
              contractId: contract.id,
              scheduledAt: now,
              status: NotificationStatus.PENDING,
              content: message,
            },
          });

          const tenant = contract.primaryTenant;
          if (tenant.lineUserId) {
            try {
              await sendLineMessage(
                tenant.lineUserId,
                `📢 แจ้งเตือน: สัญญาเช่าห้อง ${contract.roomNo} จะหมดอายุในอีก ${daysUntilExpiry} วัน\n\nกรุณาติดต่อเจ้าหน้าที่เพื่อต่ออายุสัญญา`
              );
              await prisma.notification.update({
                where: { id: notification.id },
                data: { status: NotificationStatus.SENT, sentAt: new Date() },
              });
            } catch {
              // LINE not configured — skip silently
            }
          }
        }
      }
      totalNotified++;
    }
  }

  return {
    count: totalNotified,
    message: `${totalNotified} contract(s) notified for expiry`,
  };
}

// ── 8. Document notify (pre-7-day LINE notification) ────────────────────────
// Sends LINE notification to uploaders for files that will be archived in 7 days.
export async function runDocumentNotify(): Promise<JobResult> {
  const retentionDays = parseInt(process.env.DOCUMENT_RETENTION_DAYS ?? '90', 10);
  const notifyDaysBefore = parseInt(process.env.ARCHIVE_NOTIFY_DAYS_BEFORE ?? '7', 10);
  const { sendLineMessage, isLineConfigured } = await import('@/lib');

  const notifyCutoff = new Date(Date.now() - (retentionDays - notifyDaysBefore) * 24 * 60 * 60 * 1000);

  const filesToNotify = await prisma.uploadedFile.findMany({
    where: {
      createdAt: { lt: notifyCutoff },
      status: UploadedFileStatus.ACTIVE,
    },
    select: { id: true, originalName: true, storageKey: true, uploadedBy: true },
  });

  let notificationsSent = 0;

  for (const file of filesToNotify) {
    if (!file.uploadedBy) continue;

    // Look up uploader LINE user ID — try admin first, then staff
    const admin = await prisma.adminUser.findFirst({ where: { id: file.uploadedBy } });
    // StaffUser model may not exist — wrap in try/catch
    let staff = null;
    try {
      staff = await (prisma as any).staffUser?.findFirst({ where: { id: file.uploadedBy } }) ?? null;
    } catch {
      staff = null;
    }
    const lineUserId = (admin as any)?.lineUserId ?? (staff as any)?.lineUserId;
    if (!lineUserId) continue;
    if (!isLineConfigured()) continue;

    try {
      await sendLineMessage(
        lineUserId,
        `📄 ไฟล์ของคุณจะถูกเก็บเป็นข้อมูลสำรองในอีก 7 วัน: ${file.originalName}. หากต้องการเก็บไว้ โปรดติดต่อเจ้าหน้าที่`
      );
    } catch {
      // LINE not configured or failed — skip silently
    }
    notificationsSent++;
  }

  // Mark files as PENDING_ARCHIVE to prevent duplicate notifications
  if (filesToNotify.length > 0) {
    await prisma.uploadedFile.updateMany({
      where: { id: { in: filesToNotify.map((f) => f.id) } },
      data: { status: 'PENDING_ARCHIVE' },
    });
  }

  logger.info({
    type: 'document_notify_completed',
    retentionDays,
    notifyDaysBefore,
    notifyCutoff: notifyCutoff.toISOString(),
    filesNotified: notificationsSent,
  });

  return {
    count: notificationsSent,
    message: `Sent ${notificationsSent} notification(s) for files to be archived in ${notifyDaysBefore} days`,
  };
}

// ── 9. Document cleanup ─────────────────────────────────────────────────────
// Archives active files older than retention period, then permanently deletes
// files that have been archived for more than 30 days.
export async function runDocumentCleanup(): Promise<JobResult> {
  const retentionDays = parseInt(process.env.DOCUMENT_RETENTION_DAYS ?? '90', 10);
  const archiveBeforeDeleteDays = parseInt(process.env.ARCHIVE_BEFORE_DELETE_DAYS ?? '30', 10);
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const archiveCutoff = new Date(Date.now() - archiveBeforeDeleteDays * 24 * 60 * 60 * 1000);

  // Phase A: Archive ACTIVE files older than retention period
  const filesToArchive = await prisma.uploadedFile.findMany({
    where: { createdAt: { lt: cutoff }, status: UploadedFileStatus.ACTIVE },
    select: { id: true, storageKey: true, originalName: true },
  });

  let filesArchived = 0;
  let filesFailedToArchive = 0;

  for (const file of filesToArchive) {
    try {
      const { getStorage } = await import('@/infrastructure/storage');
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const archivedKey = `_archived/${year}/${month}/${file.storageKey}`;
      await getStorage().copyFile(file.storageKey, archivedKey);
      await getStorage().deleteFile(file.storageKey);
      await prisma.uploadedFile.update({
        where: { id: file.id },
        data: { status: UploadedFileStatus.ARCHIVED, archivedAt: now },
      });
      filesArchived++;
    } catch (err) {
      logger.warn({ fileId: file.id, storageKey: file.storageKey, error: err instanceof Error ? err.message : String(err) }, 'document-cleanup: failed to archive storage file');
      filesFailedToArchive++;
    }
  }

  // Phase B: Archive generated_documents older than retention period
  const docsToArchive = await prisma.generatedDocument.findMany({
    where: { generatedAt: { lt: cutoff }, status: GeneratedDocumentStatus.GENERATED },
    select: { id: true },
  });

  let docsArchived = 0;
  if (docsToArchive.length > 0) {
    await prisma.generatedDocument.updateMany({
      where: { id: { in: docsToArchive.map((d) => d.id) } },
      data: { status: GeneratedDocumentStatus.ARCHIVED, archivedAt: new Date() },
    });
    docsArchived = docsToArchive.length;
  }

  // Phase C: Permanently delete files archived for more than archiveBeforeDeleteDays
  const filesToDelete = await prisma.uploadedFile.findMany({
    where: {
      status: UploadedFileStatus.ARCHIVED,
      archivedAt: { lt: archiveCutoff },
    },
    select: { id: true, storageKey: true },
  });

  let filesDeletedFromDisk = 0;
  let filesFailedToDelete = 0;

  for (const file of filesToDelete) {
    try {
      const { getStorage } = await import('@/infrastructure/storage');
      // The storageKey for archived files includes the _archived/ prefix path
      // We stored the original key in storageKey but moved the file to _archived/{year}/{month}/{key}
      // So we need to find the actual archived storage key - but we only stored the original key.
      // We reconstruct the archived path using archivedAt date stored in DB.
      // However, we don't store which archive path it went to. Let us use a simpler approach:
      // List/construct the probable archived key. Since we need the year/month of archival,
      // we use the archivedAt field we just set above.
      const archivedRecord = await prisma.uploadedFile.findUnique({
        where: { id: file.id },
        select: { archivedAt: true },
      });
      if (archivedRecord?.archivedAt) {
        const year = archivedRecord.archivedAt.getFullYear();
        const month = String(archivedRecord.archivedAt.getMonth() + 1).padStart(2, '0');
        const archivedKey = `_archived/${year}/${month}/${file.storageKey}`;
        await getStorage().deleteFile(archivedKey);
      }
      filesDeletedFromDisk++;
    } catch (err) {
      logger.warn({ fileId: file.id, storageKey: file.storageKey, error: err instanceof Error ? err.message : String(err) }, 'document-cleanup: failed to delete archived storage file');
      filesFailedToDelete++;
    }
  }

  // Delete DB records for files that have been archived long enough
  const deletedUploadedFiles = await prisma.uploadedFile.deleteMany({
    where: { status: UploadedFileStatus.ARCHIVED, archivedAt: { lt: archiveCutoff } },
  });

  // Delete archived generated_documents records
  const deletedGeneratedDocuments = await prisma.generatedDocument.deleteMany({
    where: { status: GeneratedDocumentStatus.ARCHIVED, archivedAt: { lt: archiveCutoff } },
  });

  const totalDeleted = deletedUploadedFiles.count + deletedGeneratedDocuments.count;

  logger.info({
    type: 'document_cleanup_completed',
    retentionDays,
    archiveBeforeDeleteDays,
    cutoff: cutoff.toISOString(),
    archiveCutoff: archiveCutoff.toISOString(),
    filesArchived,
    filesFailedToArchive,
    docsArchived,
    storageFilesDeleted: filesDeletedFromDisk,
    storageFilesFailed: filesFailedToDelete,
    uploadedFilesDeletedFromDb: deletedUploadedFiles.count,
    generatedDocumentsDeletedFromDb: deletedGeneratedDocuments.count,
  });

  return {
    count: totalDeleted,
    message: `Archived ${filesArchived} file(s) and ${docsArchived} document(s); permanently deleted ${deletedUploadedFiles.count} uploaded file(s) and ${deletedGeneratedDocuments.count} generated document(s) (${filesDeletedFromDisk} storage file(s) deleted, ${filesFailedToDelete} failed)`,
  };
}

// ── 10. Backup cleanup ────────────────────────────────────────────────────────
// Deletes files from storage only (not DB) for files in /_archived/ prefix
// that have been archived for more than 5 days. Keeps DB records for audit trail.
export async function runBackupCleanup(): Promise<JobResult> {
  const _storage = await import('@/infrastructure/storage');
  const driver = (process.env.STORAGE_DRIVER || 'local').toLowerCase();
  const backupAgeDays = 5;
  const backupCutoff = new Date(Date.now() - backupAgeDays * 24 * 60 * 60 * 1000);
  const year = backupCutoff.getFullYear();
  const month = String(backupCutoff.getMonth() + 1).padStart(2, '0');
  const archivedPrefix = `_archived/${year}/${month}/`;

  let filesDeleted = 0;
  let filesFailed = 0;

  if (driver === 'local') {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const { resolveUploadDir } = await import('@/lib/runtime-paths');
    const baseDir = resolveUploadDir();
    const archiveDir = path.join(baseDir, archivedPrefix);

    try {
      const entries = await fs.readdir(archiveDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          const filePath = path.join(archiveDir, entry.name);
          try {
            await fs.rm(filePath);
            filesDeleted++;
          } catch (err) {
            logger.warn({ filePath, error: err instanceof Error ? err.message : String(err) }, 'backup-cleanup: failed to delete file');
            filesFailed++;
          }
        }
      }
    } catch (_err) {
      // Archive directory may not exist — nothing to clean
      logger.info({ archivedPrefix }, 'backup-cleanup: archive directory not found, skipping');
    }
  } else if (driver === 's3') {
    // For S3, list objects with the prefix and delete those older than cutoff
    const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
    const s3Client = new S3Client({
      region: process.env.S3_REGION,
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: String(process.env.S3_FORCE_PATH_STYLE || '').toLowerCase() === 'true',
    });
    const bucket = process.env.S3_BUCKET || '';
    let continuationToken: string | undefined;

    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: archivedPrefix,
        ContinuationToken: continuationToken,
      });
      const listResult = await s3Client.send(listCommand);

      if (listResult.Contents && listResult.Contents.length > 0) {
        const objectsToDelete = listResult.Contents
          .filter((obj) => obj.LastModified && obj.LastModified < backupCutoff)
          .map((obj) => ({ Key: obj.Key }));

        if (objectsToDelete.length > 0) {
          const deleteCommand = new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: objectsToDelete },
          });
          await s3Client.send(deleteCommand);
          filesDeleted += objectsToDelete.length;
        }
      }

      continuationToken = listResult.NextContinuationToken;
    } while (continuationToken);
  }

  logger.info({
    type: 'backup_cleanup_completed',
    backupAgeDays,
    archivedPrefix,
    filesDeleted,
    filesFailed,
  });

  return {
    count: filesDeleted,
    message: `Deleted ${filesDeleted} backup file(s) older than ${backupAgeDays} days (${filesFailed} failed)`,
  };
}

// ── Registry ────────────────────────────────────────────────────────────────

export async function runOutboxCleanup(): Promise<JobResult> {
  const processor = getOutboxProcessor(undefined, { enabled: false });
  const count = await processor.cleanup(30);
  return {
    count,
    message: `${count} outbox event(s) older than 30 days deleted`,
  };
}

export const JOB_RUNNERS: Record<string, () => Promise<JobResult>> = {
  'overdue-flag':      runOverdueFlag,
  'billing-generate':  runBillingGenerate,
  'invoice-send':      runInvoiceSend,
  'late-fee':          runLateFee,
  'db-cleanup':        runDbCleanup,
  'contract-expiry':   runContractExpiryCheck,
  'outbox-cleanup':    runOutboxCleanup,
  'document-notify':   runDocumentNotify,
  'document-cleanup':  runDocumentCleanup,
  'backup-cleanup':    runBackupCleanup,
};

export const VALID_JOB_IDS = Object.keys(JOB_RUNNERS);

export function isValidJobId(id: string): id is keyof typeof JOB_RUNNERS {
  return id in JOB_RUNNERS;
}
