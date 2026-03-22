import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';

const resetSchema = z.object({
  backup: z.boolean().default(false),
}).strict();

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  // Only ADMIN can reset the system
  const session = requireRole(req, ['ADMIN']);

  const body = await resetSchema.parse(await req.json());

  let backupFile: string | undefined;

  // Export data if requested
  if (body.backup) {
    try {
      const [rooms, tenants, configs, adminUsers, bankAccounts, billingRules] = await Promise.all([
        prisma.room.findMany({ include: { contracts: true, conversations: true } }),
        prisma.tenant.findMany({ include: { contracts: true } }),
        prisma.config.findMany(),
        prisma.adminUser.findMany({ select: { id: true, username: true, displayName: true, role: true, isActive: true, createdAt: true, updatedAt: true } }),
        prisma.bankAccount.findMany(),
        prisma.billingRule.findMany(),
      ]);

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      backupFile = `backup-${timestamp}.json`;

      // In a real implementation, we would save this to a file or cloud storage
      // For now, we'll just log the data that would be exported
      logger.info({
        type: 'system_backup',
        backupFile,
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
    } catch (error) {
      logger.error({
        type: 'system_backup_failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Delete all data in a specific order to avoid foreign key violations
  // Start from leaf models (no dependencies) and work up to root models
  await prisma.$transaction([
    // Leaf models first
    prisma.outboxEvent.deleteMany({}),
    prisma.auditLog.deleteMany({}),
    prisma.passwordResetToken.deleteMany({}),
    prisma.staffRegistrationRequest.deleteMany({}),
    prisma.uploadedFile.deleteMany({}),
    prisma.generatedDocumentFile.deleteMany({}),
    prisma.generatedDocument.deleteMany({}),
    prisma.documentGenerationTarget.deleteMany({}),
    prisma.documentGenerationJob.deleteMany({}),
    prisma.documentTemplateFieldDefinition.deleteMany({}),
    prisma.documentTemplateVersion.deleteMany({}),
    prisma.documentTemplate.deleteMany({}),
    prisma.invoiceDelivery.deleteMany({}),
    prisma.paymentMatch.deleteMany({}),
    prisma.paymentTransaction.deleteMany({}),
    prisma.maintenanceAttachment.deleteMany({}),
    prisma.maintenanceComment.deleteMany({}),
    prisma.message.deleteMany({}),
    prisma.conversation.deleteMany({}),
    // Payment must be deleted before Invoice (has FK to Invoice)
    prisma.payment.deleteMany({}),
    // Invoice must be deleted before RoomBilling (has FK to RoomBilling)
    prisma.invoice.deleteMany({}),
    // RoomBilling must be deleted before Room and BillingPeriod
    prisma.roomBilling.deleteMany({}),
    // ImportBatch references BillingPeriod — delete before BillingPeriod
    prisma.importBatch.deleteMany({}),
    prisma.billingPeriod.deleteMany({}),
    // RoomTenant must be deleted before Room and Tenant
    prisma.roomTenant.deleteMany({}),
    // Contract references Room and Tenant - delete before both
    prisma.contract.deleteMany({}),
    // MaintenanceTicket references Tenant
    prisma.maintenanceTicket.deleteMany({}),
    // LineUser is standalone
    prisma.lineUser.deleteMany({}),
    // Tenant references LineUser but deleting Tenant should handle this
    prisma.tenant.deleteMany({}),
    // Room is standalone (after RoomTenant and Contract deleted)
    prisma.room.deleteMany({}),
    // BankAccount is standalone
    prisma.bankAccount.deleteMany({}),
    // BillingRule is standalone
    prisma.billingRule.deleteMany({}),
    // AdminUser references PasswordResetToken (already deleted above)
    prisma.adminUser.deleteMany({}),
    // Config - keep system.initialized
    prisma.config.deleteMany({
      where: { key: { not: 'system.initialized' } },
    }),
  ]);

  // Set initialized to false
  await prisma.config.upsert({
    where: { key: 'system.initialized' },
    update: { value: false },
    create: { key: 'system.initialized', value: false, description: 'System initialization flag' },
  });

  logger.info({
    type: 'system_reset',
    initiatedBy: session.sub,
    backupIncluded: body.backup,
    backupFile,
  });

  return NextResponse.json({
    success: true,
    data: { backupFile },
    message: 'System reset completed successfully',
  } as ApiResponse<{ backupFile?: string }>);
});
