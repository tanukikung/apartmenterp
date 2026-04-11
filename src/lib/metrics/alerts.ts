/**
 * In-memory alert store for system health alerts.
 * Tracks recent alert history with severity levels.
 */

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface Alert {
  id: string;
  severity: AlertSeverity;
  source: string;
  message: string;
  timestamp: string;
  meta?: Record<string, unknown>;
}

const MAX_ALERTS = 50;

// Module-level singleton — resets on server restart
const alerts: Alert[] = [];

function generateId(): string {
  return `alert_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Record a new alert.
 */
export function recordAlert(
  severity: AlertSeverity,
  source: string,
  message: string,
  meta?: Record<string, unknown>
): void {
  const alert: Alert = {
    id: generateId(),
    severity,
    source,
    message,
    timestamp: new Date().toISOString(),
    meta,
  };
  alerts.unshift(alert);
  // Keep only the most recent MAX_ALERTS
  if (alerts.length > MAX_ALERTS) {
    alerts.length = MAX_ALERTS;
  }
}

/**
 * Get all recorded alerts (most recent first).
 */
export function getAlerts(): Alert[] {
  return [...alerts];
}

/**
 * Get alerts filtered by severity.
 */
export function getAlertsBySeverity(severity: AlertSeverity): Alert[] {
  return alerts.filter((a) => a.severity === severity);
}

/**
 * Get the most recent critical alert.
 */
export function getLatestCriticalAlert(): Alert | null {
  return alerts.find((a) => a.severity === 'critical') ?? null;
}

/**
 * Get count of unresolved (critical/warning) alerts.
 */
export function getActiveAlertCount(): number {
  return alerts.filter((a) => a.severity === 'critical' || a.severity === 'warning').length;
}

/**
 * Clear all alerts (e.g., after they have been acknowledged).
 */
export function clearAlerts(): void {
  alerts.length = 0;
}
