import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { logAudit } from '@/modules/audit/audit.service';
import { logger } from '@/lib/utils/logger';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

const resetSchema = z.object({
  backup: z.boolean().default(false),
}).strict();

/**
 * Writes backup JSON to S3. Throws if BACKUP_BUCKET or AWS credentials are missing,
 * or if the S3 PutObject call fails. The caller must NOT proceed with the destructive
 * reset if this throws — backup is mandatory when backup=true.
 */
async function writeBackupToS3(key: string, jsonData: string): Promise<string> {
  const bucket = process.env.BACKUP_BUCKET;
  if (!bucket) {
    throw new Error('BACKUP_BUCKET environment variable is not set — S3 backup is required when backup=true');
  }
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS credentials (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY) are not configured — S3 backup is required when backup=true');
  }

  const { S3Client } = await import('@/lib/s3/client');
  const client = new S3Client({
    region: process.env.AWS_REGION || 'ap-southeast-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');

  try {
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: jsonData,
      ContentType: 'application/json',
    }));
  } catch (error) {
    throw new Error(
      `S3 PutObject failed: ${error instanceof Error ? error.message : String(error)} — backup must succeed before destructive reset`
    );
  }

  return `s3://${bucket}/${key}`;
}

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`admin-setup-reset:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  // Only ADMIN can reset the system
  const session = requireRole(req, ['OWNER']);

  const body = await resetSchema.parse(await req.json());

  let backupS3Uri: string | undefined;

  // Export data if requested
  if (body.backup) {
    const [rooms, tenants, configs, adminUsers, bankAccounts, billingRules] = await Promise.all([
      prisma.room.findMany({ include: { contracts: true, conversations: true } }),
      prisma.tenant.findMany({ include: { contracts: true } }),
      prisma.config.findMany(),
      prisma.adminUser.findMany({ select: { id: true, username: true, displayName: true, role: true, isActive: true, createdAt: true, updatedAt: true } }),
      prisma.bankAccount.findMany(),
      prisma.billingRule.findMany(),
    ]);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupKey = `backups/apartment-erp-${timestamp}.json`;

    const backupData = JSON.stringify({
      exportedBy: session.sub,
      exportedAt: new Date().toISOString(),
      version: '1.0',
      recordCounts: {
        rooms: rooms.length,
        tenants: tenants.length,
        configs: configs.length,
        adminUsers: adminUsers.length,
        bankAccounts: bankAccounts.length,
        billingRules: billingRules.length,
      },
      data: { rooms, tenants, configs, adminUsers, bankAccounts, billingRules },
    });

    // writeBackupToS3 throws if S3 is not configured or the upload fails.
    // The destructive reset MUST NOT proceed if backup=true and the backup fails.
    const s3Uri = await writeBackupToS3(backupKey, backupData);
    backupS3Uri = s3Uri;

    logger.info({
      type: 'system_backup',
      backupFile: s3Uri,
      exportedBy: session.sub,
      exportedAt: new Date().toISOString(),
      recordCounts: {
        rooms: rooms.length,
        tenants: tenants.length,
        configs: configs.length,
        adminUsers: adminUsers.length,
        bankAccounts: bankAccounts.length,
        billingRules: billingRules.length,
      },
    });
  }

  await logAudit({
    req,
    action: 'SYSTEM_RESET',
    entityType: 'SYSTEM',
    entityId: 'system',
    metadata: { backupEnabled: body.backup === true, backupS3Uri },
  });

  // Delete all data in a specific order to avoid foreign key violations
  // Start from leaf models (no dependencies) and work up to root models.
  // The config.upsert is included in the same transaction so either both
  // the data wipe AND the initialized=false flag commit together, or neither does.
  await prisma.$transaction(async (tx) => {
    // Leaf models first
    await tx.outboxEvent.deleteMany({});
    await tx.auditLog.deleteMany({});
    await tx.passwordResetToken.deleteMany({});
    await tx.staffRegistrationRequest.deleteMany({});
    await tx.uploadedFile.deleteMany({});
    await tx.generatedDocumentFile.deleteMany({});
    await tx.generatedDocument.deleteMany({});
    await tx.documentGenerationTarget.deleteMany({});
    await tx.documentGenerationJob.deleteMany({});
    await tx.documentTemplateFieldDefinition.deleteMany({});
    await tx.documentTemplateVersion.deleteMany({});
    await tx.documentTemplate.deleteMany({});
    await tx.invoiceDelivery.deleteMany({});
    await tx.paymentMatch.deleteMany({});
    await tx.paymentTransaction.deleteMany({});
    await tx.maintenanceAttachment.deleteMany({});
    await tx.maintenanceComment.deleteMany({});
    await tx.message.deleteMany({});
    await tx.conversation.deleteMany({});
    // Payment must be deleted before Invoice (has FK to Invoice)
    await tx.payment.deleteMany({});
    // Invoice must be deleted before RoomBilling (has FK to RoomBilling)
    await tx.invoice.deleteMany({});
    // RoomBilling must be deleted before Room and BillingPeriod
    await tx.roomBilling.deleteMany({});
    // ImportBatch references BillingPeriod — delete before BillingPeriod
    await tx.importBatch.deleteMany({});
    await tx.billingPeriod.deleteMany({});
    // RoomTenant must be deleted before Room and Tenant
    await tx.roomTenant.deleteMany({});
    // Contract references Room and Tenant - delete before both
    await tx.contract.deleteMany({});
    // MaintenanceTicket references Tenant
    await tx.maintenanceTicket.deleteMany({});
    // LineUser is standalone
    await tx.lineUser.deleteMany({});
    // Tenant references LineUser but deleting Tenant should handle this
    await tx.tenant.deleteMany({});
    // Room is standalone (after RoomTenant and Contract deleted)
    await tx.room.deleteMany({});
    // BankAccount is standalone
    await tx.bankAccount.deleteMany({});
    // BillingRule is standalone
    await tx.billingRule.deleteMany({});
    // AdminUser references PasswordResetToken (already deleted above)
    await tx.adminUser.deleteMany({});
    // Config - keep system.initialized
    await tx.config.deleteMany({
      where: { key: { not: 'system.initialized' } },
    });

    // Set initialized to false — inside same transaction as the wipe
    await tx.config.upsert({
      where: { key: 'system.initialized' },
      update: { value: false },
      create: { key: 'system.initialized', value: false, description: 'System initialization flag' },
    });
  });

  logger.info({
    type: 'system_reset',
    initiatedBy: session.sub,
    backupIncluded: body.backup,
    backupS3Uri,
  });

  const message = body.backup
    ? backupS3Uri
      ? `System reset completed. Backup saved to: ${backupS3Uri}`
      : 'System reset completed. Backup skipped: S3 not configured.'
    : 'System reset completed successfully.';

  return NextResponse.json({
    success: true,
    data: { backupS3Uri },
    message,
  } as ApiResponse<{ backupS3Uri?: string | null }>);
});
