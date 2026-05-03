/**
 * Centralized config accessor — reads from the Config table.
 * Falls back to defaults when keys are not set.
 *
 * Usage:
 *   const mode = await getConfig<PaymentMatchMode>('payment.matchMode', PaymentMatchMode.ALLOW_SMALL_DIFF);
 */

import { prisma } from '@/lib/db/client';
import { PaymentMatchMode } from '@/modules/payments/payment-tolerance';

export type ConfigKey =
  | 'payment.matchMode'
  | 'payment.toleranceAmount'
  | 'invoice.cancelRoles'
  | 'invoice.strictStatusSource'
  | 'system.maintenanceMode';

const CONFIG_DEFAULTS: Record<ConfigKey, unknown> = {
  'payment.matchMode': PaymentMatchMode.ALLOW_SMALL_DIFF,
  'payment.toleranceAmount': 1.0,
  'invoice.cancelRoles': ['ADMIN', 'OWNER'],
  'invoice.strictStatusSource': true,
  'system.maintenanceMode': false,
};

/**
 * Get a config value by key, with a type-safe default.
 * Returns the default if the key is not found in the database.
 */
export async function getConfig<T>(key: ConfigKey, defaultValue: T): Promise<T> {
  const row = await prisma.config.findUnique({ where: { key } });
  if (!row) return defaultValue;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return row.value as T;
}

/**
 * Get a config value, throwing if not found.
 * Use this for required config values.
 */
export async function getRequiredConfig<T>(key: ConfigKey): Promise<T> {
  const row = await prisma.config.findUnique({ where: { key } });
  if (!row) throw new Error(`Config key "${key}" is not set`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return row.value as T;
}

/**
 * Set a config value (upsert).
 */
export async function setConfig(key: ConfigKey, value: unknown): Promise<void> {
  await prisma.config.upsert({
    where: { key },
    create: { key, value: value as never },
    update: { value: value as never },
  });
}