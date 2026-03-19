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
  const prisma = {
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

    // Misc
    uploadedFile:        model(),
    auditLog:            model(),

    // Prisma transaction helper
    $transaction: vi.fn(async (fn: (tx: any) => any) => {
      const tx: Record<string, ReturnType<typeof model>> = {
        invoice:            prisma.invoice,
        invoiceDelivery:    prisma.invoiceDelivery,
        billingPeriod:      prisma.billingPeriod,
        roomBilling:        prisma.roomBilling,
        importBatch:        prisma.importBatch,
        payment:            prisma.payment,
        outboxEvent:        prisma.outboxEvent,
        billingRecord:      prisma.billingRecord,
        billingItem:        prisma.billingItem,
        billingItemType:    prisma.billingItemType,
        paymentTransaction: prisma.paymentTransaction,
        invoiceVersion:     prisma.invoiceVersion,
        room:               prisma.room,
        roomTenant:         prisma.roomTenant,
        floor:              prisma.floor,
        tenant:             prisma.tenant,
        config:             prisma.config,
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
        uploadedFile:       prisma.uploadedFile,
        auditLog:           prisma.auditLog,
      };
      return fn(tx);
    }),
  } as any;
  return prisma;
}

declare global {
  // eslint-disable-next-line no-var
  var __PRISMA_MOCK__: any | undefined;
}
