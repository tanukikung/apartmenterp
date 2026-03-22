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
export function resetServiceContainer(): void {
  container = null;
}
