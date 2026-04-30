import { vi } from 'vitest';

type Fn = ReturnType<typeof vi.fn>;

function model() {
  return {
    findUnique:  vi.fn(),
    findFirst:   vi.fn(),
    findMany:    vi.fn(),
    create:      vi.fn(),
    createMany:  vi.fn(),
    update:      vi.fn(),
    updateMany:  vi.fn(),
    delete:      vi.fn(),
    deleteMany:  vi.fn(),
    count:       vi.fn(),
    aggregate:   vi.fn(),
    groupBy:     vi.fn(),
    upsert:      vi.fn(),
    findRaw:     vi.fn(),
    aggregateRaw: vi.fn(),
    $executeRaw:       vi.fn().mockResolvedValue(0),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
  };
}

export function mockPrismaClient() {
  const prisma: Record<string, unknown> = {
    // Core billing / invoices
    invoice:             model(),
    invoiceDelivery:     model(),
    billingPeriod:       model(),
    roomBilling:         model(),
    importBatch:         model(),
    payment:             model(),
    outboxEvent:         model(),
    billingAuditLog:     model(),
    paymentHistory:      model(),
    failedMessage:       model(),
    idempotencyRecord:   model(),

    // Legacy model aliases (kept for backward compatibility in tests)
    billingRecord:       model(),
    billingItem:         model(),
    billingItemType:     model(),
    paymentTransaction:  model(),
    invoiceVersion:      model(),

    // Property
    room:                model(),
    roomTenant:          model(),
    floor:               model(),
    tenant:              model(),
    contract:            model(),
    moveOut:             model(),
    moveOutItem:         model(),
    bankAccount:         model(),
    billingRule:         model(),
    tenantRegistration:  model(),
    staffRegistrationRequest: model(),
    admin:               model(),
    expense:             model(),
    config:              model(),

    // Templates
    documentTemplate:    model(),
    documentTemplateVersion: model(),
    documentTemplateComment: model(),
    documentTemplateFieldDefinition: model(),
    documentGenerationJob: model(),
    documentGenerationTarget: model(),
    generatedDocument: model(),
    generatedDocumentFile: model(),
    templateVersionImage: model(),
    messageTemplate:     model(),

    // Comms
    conversation:        model(),
    message:             model(),
    lineUser:            model(),
    lineMaintenanceState: model(),
    broadcast:           model(),
    notification:        model(),
    reminderConfig:      model(),

    // Maintenance
    maintenanceTicket:   model(),
    maintenanceComment:  model(),
    maintenanceAttachment: model(),

    // Delivery
    deliveryOrder:       model(),
    deliveryOrderItem:   model(),

    // Misc
    uploadedFile:        model(),
    auditLog:            model(),
    adminUser:           model(),
    passwordResetToken:  model(),

    // Raw SQL (used by outbox processor and raw queries)
    $queryRaw:       vi.fn().mockResolvedValue([]),
    $executeRaw:       vi.fn().mockResolvedValue(0),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    findRaw:         vi.fn().mockResolvedValue([]),
    aggregateRaw:   vi.fn().mockResolvedValue([]),

    // Prisma transaction helper
    $transaction: vi.fn(async (fn: (tx: Record<string, ReturnType<typeof model>>) => any) => {
      const tx: Record<string, ReturnType<typeof model>> = {
        invoice:            prisma.invoice,
        invoiceDelivery:    prisma.invoiceDelivery,
        billingPeriod:      prisma.billingPeriod,
        roomBilling:        prisma.roomBilling,
        importBatch:        prisma.importBatch,
        payment:            prisma.payment,
        paymentTransaction:  prisma.paymentTransaction,
        outboxEvent:        prisma.outboxEvent,
        billingAuditLog:    prisma.billingAuditLog,
        paymentHistory:     prisma.paymentHistory,
        failedMessage:      prisma.failedMessage,
        idempotencyRecord:  prisma.idempotencyRecord,
        billingRecord:      prisma.billingRecord,
        billingItem:        prisma.billingItem,
        billingItemType:    prisma.billingItemType,
        invoiceVersion:     prisma.invoiceVersion,
        room:               prisma.room,
        roomTenant:         prisma.roomTenant,
        floor:              prisma.floor,
        tenant:             prisma.tenant,
        contract:           prisma.contract,
        moveOut:            prisma.moveOut,
        moveOutItem:        prisma.moveOutItem,
        bankAccount:        prisma.bankAccount,
        billingRule:        prisma.billingRule,
        tenantRegistration:  prisma.tenantRegistration,
        staffRegistrationRequest: prisma.staffRegistrationRequest,
        admin:              prisma.admin,
        adminUser:          prisma.adminUser,
        passwordResetToken: prisma.passwordResetToken,
        expense:            prisma.expense,
        config:             prisma.config,
        auditLog:           prisma.auditLog,
        documentTemplate:   prisma.documentTemplate,
        documentTemplateVersion: prisma.documentTemplateVersion,
        documentTemplateComment: prisma.documentTemplateComment,
        documentTemplateFieldDefinition: prisma.documentTemplateFieldDefinition,
        documentGenerationJob: prisma.documentGenerationJob,
        documentGenerationTarget: prisma.documentGenerationTarget,
        generatedDocument: prisma.generatedDocument,
        generatedDocumentFile: prisma.generatedDocumentFile,
        templateVersionImage: prisma.templateVersionImage,
        messageTemplate:    prisma.messageTemplate,
        conversation:       prisma.conversation,
        message:            prisma.message,
        lineUser:           prisma.lineUser,
        lineMaintenanceState: prisma.lineMaintenanceState,
        broadcast:          prisma.broadcast,
        notification:       prisma.notification,
        reminderConfig:      prisma.reminderConfig,
        maintenanceTicket:  prisma.maintenanceTicket,
        maintenanceComment: prisma.maintenanceComment,
        maintenanceAttachment: prisma.maintenanceAttachment,
        deliveryOrder:      prisma.deliveryOrder,
        deliveryOrderItem:   prisma.deliveryOrderItem,
        uploadedFile:       prisma.uploadedFile,
      };
      // Raw SQL methods for tx
      (tx as Record<string, Fn>).$queryRaw = vi.fn().mockResolvedValue([]);
      (tx as Record<string, Fn>).$executeRaw = vi.fn().mockResolvedValue(0);
      (tx as Record<string, Fn>).$executeRawUnsafe = vi.fn().mockResolvedValue(0);
      return fn(tx);
    }),
  } as unknown as typeof prisma;
  return prisma;
}

declare global {
  // eslint-disable-next-line no-var
  var __PRISMA_MOCK__: any | undefined;
}
