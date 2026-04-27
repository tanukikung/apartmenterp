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
  };
}

export function mockPrismaClient() {
  const prisma: Record<string, any> = {
    // Core billing / invoices (new schema)
    invoice:             model(),
    invoiceDelivery:     model(),
    billingPeriod:       model(),
    roomBilling:         model(),
    importBatch:         model(),
    payment:             model(),
    outboxEvent:         model(),

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
    documentTemplateFieldDefinition: model(),
    documentGenerationJob: model(),
    documentGenerationTarget: model(),
    generatedDocument: model(),
    generatedDocumentFile: model(),
    messageTemplate:     model(),

    // Comms
    conversation:        model(),
    message:             model(),
    lineUser:            model(),
    broadcast:           model(),
    notification:        model(),
    reminderConfig:      model(),

    // Misc
    uploadedFile:        model(),
    auditLog:            model(),

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
        expense:            prisma.expense,
        config:             prisma.config,
        auditLog:           prisma.auditLog,
        documentTemplate:   prisma.documentTemplate,
        documentTemplateVersion: prisma.documentTemplateVersion,
        documentTemplateFieldDefinition: prisma.documentTemplateFieldDefinition,
        documentGenerationJob: prisma.documentGenerationJob,
        documentGenerationTarget: prisma.documentGenerationTarget,
        generatedDocument: prisma.generatedDocument,
        generatedDocumentFile: prisma.generatedDocumentFile,
        messageTemplate:    prisma.messageTemplate,
        conversation:       prisma.conversation,
        message:            prisma.message,
        lineUser:           prisma.lineUser,
        broadcast:          prisma.broadcast,
        notification:       prisma.notification,
        reminderConfig:      prisma.reminderConfig,
        uploadedFile:       prisma.uploadedFile,
      };
      // $queryRaw is used by the outbox processor for SKIP LOCKED batches
      (tx as any).$queryRaw = vi.fn().mockResolvedValue([]);
      return fn(tx);
    }),
  } as any;
  return prisma;
}

declare global {
  // eslint-disable-next-line no-var
  var __PRISMA_MOCK__: any | undefined;
}
