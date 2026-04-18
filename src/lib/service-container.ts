import { EventBus } from '@/lib/events/event-bus';
import { BillingService } from '@/modules/billing/billing.service';
import { RoomService } from '@/modules/rooms/room.service';
import { TenantService } from '@/modules/tenants/tenant.service';
import { InvoiceService } from '@/modules/invoices/invoice.service';
import { PaymentService } from '@/modules/payments/payment.service';
import { PaymentMatchingService } from '@/modules/payments/payment-matching.service';
import { MaintenanceService } from '@/modules/maintenance/maintenance.service';
import { ContractService } from '@/modules/contracts/contract.service';
import { ReminderService } from '@/modules/reminders/reminder.service';
import { InvoicePDFService } from '@/modules/invoices/invoice-pdf.service';
import { disconnectPrisma } from '@/lib';

/**
 * Service container providing all domain services with a shared EventBus instance.
 *
 * LIFECYCLE NOTES:
 * - **getServiceContainer() vs createServiceContainer()**: Use getServiceContainer()
 *   for the shared singleton in API routes. Use createServiceContainer() in tests to
 *   get an isolated container with its own EventBus (prevents test pollution).
 * - **Test isolation**: Call resetServiceContainer() after each test (e.g., in afterEach)
 *   to disconnect Prisma and clear the singleton. Also call EventBus.resetInstance().
 * - **Hot reload**: Call resetServiceContainer() during dev reload to avoid stale connections.
 * - **Thread safety**: Node.js is single-threaded; the container is process-global,
 *   not per-request. Services should be stateless; Prisma manages its own connection pool.
 */

export interface ServiceContainer {
  eventBus: EventBus;
  billingService: BillingService;
  roomService: RoomService;
  tenantService: TenantService;
  invoiceService: InvoiceService;
  paymentService: PaymentService;
  paymentMatchingService: PaymentMatchingService;
  maintenanceService: MaintenanceService;
  contractService: ContractService;
  reminderService: ReminderService;
  invoicePDFService: InvoicePDFService;
}

// Singleton instance
let container: ServiceContainer | null = null;

export function createServiceContainer(): ServiceContainer {
  const eventBus = new EventBus();
  return {
    eventBus,
    billingService: new BillingService(eventBus),
    roomService: new RoomService(eventBus),
    tenantService: new TenantService(eventBus),
    invoiceService: new InvoiceService(eventBus),
    paymentService: new PaymentService(),
    paymentMatchingService: new PaymentMatchingService(),
    maintenanceService: new MaintenanceService(),
    contractService: new ContractService(eventBus),
    reminderService: new ReminderService(),
    invoicePDFService: new InvoicePDFService(),
  };
}

export function getServiceContainer(): ServiceContainer {
  if (!container) {
    container = createServiceContainer();
  }
  return container;
}

// For testing - allows fresh container
export async function resetServiceContainer(): Promise<void> {
  if (container) {
    // Disconnect Prisma to avoid connection accumulation during hot reload
    await disconnectPrisma();
  }
  container = null;
}
