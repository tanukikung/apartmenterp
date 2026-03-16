import { logger } from '@/lib/utils/logger';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AlertPayload {
  title: string;
  message: string;
  severity: AlertSeverity;
  details?: Record<string, unknown>;
}

export interface Notifier {
  notify: (payload: AlertPayload) => Promise<void>;
}

class NoopNotifier implements Notifier {
  async notify(payload: AlertPayload): Promise<void> {
    logger.warn({
      type: 'alert_notify_noop',
      title: payload.title,
      message: payload.message,
      severity: payload.severity,
      details: payload.details,
    });
  }
}

let current: Notifier = new NoopNotifier();

export function setNotifier(n: Notifier): void {
  current = n;
}

export async function notifyAlert(payload: AlertPayload): Promise<void> {
  await current.notify(payload);
}

