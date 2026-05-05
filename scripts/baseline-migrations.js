const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const names = [
      '20260101000000_baseline',
      '20260324115217_add_delivery_orders_and_registration_step',
      '20260326100000_add_payment_transaction_dedup',
      '20260401000000_migrate_room_status_enum',
      '20260411000000_add_line_maintenance_expenses_broadcast_reminder',
      '20260429000000_drop_unused_invoice_payment_junction',
      '20260430000000_add_confirmed_payment_invoice_unique_idx',
      '20260430000001_add_outbox_event_unique_idx',
      '20260430000002_add_contract_active_partial_unique_idx',
      '20260501000000_add_invoice_send_idempotency',
      '20260501000000_drop_contract_room_status_unique',
      '20260502000000_add_composite_indexes_for_billing_queries',
      '20260502000001_add_conversation_cascade_delete',
      '20260503000000_add_outbox_last_attempt_at',
      '20260503000000_financial_safety_hardening',
      '20260503000000_production_hardening',
      '20260503000001_scale_ready_tables_and_indexes',
      '20260503000002_zero_loss_messaging',
      '20260503000003_dlq_hardening',
      '20260504000000_hardening_idempotency_dedup',
      '20260504000001_invoice_notification_sent_at',
      '20260505000000_outbox_state_machine',
      '20260506000000_phase_8_financial_safety_undelete',
    ];

    // Use $executeRaw tagged template for proper parameter substitution
    for (const n of names) {
      await prisma.$executeRaw`INSERT INTO _prisma_migrations (migration_name, finished_at, migration_status, applied_steps_count) VALUES (${n}, now(), 'SUCCESS', 1) ON CONFLICT (migration_name) DO NOTHING`;
    }
    const cnt = await prisma.$queryRaw`SELECT count(*) as c FROM _prisma_migrations`;
    console.log('Inserted', cnt[0].c, 'migration records');
    console.log('Ready for prisma migrate deploy');

  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
