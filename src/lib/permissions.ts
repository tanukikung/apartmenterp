/**
 * permissions — module feature flags.
 * Controls which modules are visible/enabled per admin user role.
 */

export type ModuleKey =
  | 'contracts'
  | 'moveouts'
  | 'line'
  | 'chat'
  | 'messageSequences'
  | 'documents'
  | 'templates'
  | 'deliveryOrders'
  | 'analytics'
  | 'auditLogs'
  | 'automation';

export type ModuleFlags = Record<ModuleKey, boolean>;

export const DEFAULT_MODULE_FLAGS: ModuleFlags = {
  contracts: true,
  moveouts: true,
  line: true,
  chat: true,
  messageSequences: true,
  documents: true,
  templates: true,
  deliveryOrders: true,
  analytics: true,
  auditLogs: true,
  automation: true,
};
