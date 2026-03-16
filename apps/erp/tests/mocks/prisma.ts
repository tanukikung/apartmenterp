import { vi } from 'vitest';

type Fn = ReturnType<typeof vi.fn>;

function model() {
  return {
    findUnique:  vi.fn(),
    findFirst:   vi.fn(),
    findMany:    vi.fn(),
    create:      vi.fn(),
    update:      vi.fn(),
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
    // Core billing / invoices
    invoice:             model(),
    invoiceVersion:      model(),
    invoiceDelivery:     model(),   // ← Phase 3: delivery lifecycle tracking
    billingRecord:       model(),
    billingItem:         model(),
    payment:             model(),
    paymentTransaction:  model(),
    outboxEvent:         model(),

    // Property
    room:                model(),
    floor:               model(),
    tenant:              model(),

    // Templates
    documentTemplate:    model(),   // ← Phase 5: template CRUD + audit
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
        invoiceVersion:     prisma.invoiceVersion,
        invoiceDelivery:    prisma.invoiceDelivery,
        billingRecord:      prisma.billingRecord,
        billingItem:        prisma.billingItem,
        payment:            prisma.payment,
        paymentTransaction: prisma.paymentTransaction,
        outboxEvent:        prisma.outboxEvent,
        room:               prisma.room,
        floor:              prisma.floor,
        tenant:             prisma.tenant,
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
