import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for merging Tailwind classes
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// Format currency
export function formatCurrency(amount: number | string, currency: string = 'THB'): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency,
  }).format(num);
}

// Format date
export function formatDate(date: Date | string, locale?: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale || 'th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// Format datetime
export function formatDateTime(date: Date | string, locale?: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString(locale || 'th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Format relative time in Thai (e.g. "5 นาทีที่แล้ว", "2 ชั่วโมงที่แล้ว")
export function formatRelativeTime(date: Date | string, locale?: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  const rtf = new Intl.RelativeTimeFormat(locale || 'th-TH', { numeric: 'auto' });

  if (diffSec < 60) {
    return rtf.format(-diffSec, 'second');
  } else if (diffMin < 60) {
    return rtf.format(-diffMin, 'minute');
  } else if (diffHr < 24) {
    return rtf.format(-diffHr, 'hour');
  } else {
    return rtf.format(-diffDay, 'day');
  }
}

// Get month name
export function getMonthName(month: number): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[month - 1];
}

// Get billing period string
export function getBillingPeriod(year: number, month: number): string {
  return `${getMonthName(month)} ${year}`;
}

// Calculate days between dates
export function daysBetween(start: Date, end: Date): number {
  const startTime = start.getTime();
  const endTime = end.getTime();
  return Math.ceil((endTime - startTime) / (1000 * 60 * 60 * 24));
}

// Check if date is overdue
export function isOverdue(dueDate: Date, overdueDay: number): boolean {
  const today = new Date();
  const msInDay = 1000 * 60 * 60 * 24;
  const diffDays = Math.floor((today.getTime() - dueDate.getTime()) / msInDay);
  return diffDays > overdueDay;
}

// Generate room number
export function generateRoomNumber(floor: number, room: number): string {
  return `${floor}${room.toString().padStart(2, '0')}`;
}

// Parse room number
export function parseRoomNumber(roomNumber: string): { floor: number; room: number } {
  const floor = parseInt(roomNumber.charAt(0));
  const room = parseInt(roomNumber.slice(1));
  return { floor, room };
}

// Validate Thai national ID
export function validateThaiNationalId(id: string): boolean {
  if (!/^\d{13}$/.test(id)) return false;
  
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(id[i]) * (13 - i);
  }
  
  const checkDigit = (11 - (sum % 11)) % 10;
  return checkDigit === parseInt(id[12]);
}

// Validate phone number
export function validatePhone(phone: string): boolean {
  // Thai phone number format
  const cleaned = phone.replace(/[\s-]/g, '');
  return /^(\+66|0)[89]\d{8}$/.test(cleaned);
}

// Format phone number
export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/[\s-]/g, '');
  if (cleaned.startsWith('+66')) {
    return cleaned.replace('+66', '0');
  }
  return cleaned;
}

// Paginate array
export function paginate<T>(
  array: T[],
  page: number,
  pageSize: number
): { data: T[]; total: number; page: number; pageSize: number; totalPages: number } {
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const data = array.slice(start, end);
  
  return {
    data,
    total: array.length,
    page,
    pageSize,
    totalPages: Math.ceil(array.length / pageSize),
  };
}

// Debounce function
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Require environment variable
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is required`);
  }
  return value;
}

// Convert string to boolean
export function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  return value.toLowerCase() === 'true' || value === '1';
}
