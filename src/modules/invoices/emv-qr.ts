/**
 * EMV QR Code helpers for Thai PromptPay standard.
 * Falls back to legacy pipe-delimited format when PromptPay number is not configured.
 */

/**
 * Build a Thai PromptPay EMV QR payload string (synchronous).
 * @param promptpayNumber National ID (13 digits) or mobile phone (09xxxxxxxx)
 * @param amount Amount in THB
 * @param _merchantName Merchant display name (Thai) — embedded by promptpay library
 */
export function buildPromptPayPayload(
  promptpayNumber: string,
  amount: number,
  _merchantName = 'อพาร์ตเมนต์',
): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { anyId } = require('promptparse/generate') as { anyId: (p: { type: string; target: string; amount: number }) => string };
  const type = promptpayNumber.length === 13 ? 'NATID' : promptpayNumber.length >= 15 ? 'EWALLETID' : 'MSISDN';
  return anyId({ type, target: promptpayNumber, amount });
}

/**
 * Build a Thai PromptPay EMV QR as base64 data URL (async).
 * @param promptpayNumber National ID (13 digits) or mobile phone (09xxxxxxxx)
 * @param amount Amount in THB
 * @param _merchantName Merchant display name (Thai) — embedded by promptpay library
 */
export async function buildPromptPayQrDataUrl(
  promptpayNumber: string,
  amount: number,
  _merchantName = 'อพาร์ตเมนต์',
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { qr } = require('promptpay') as { qr: (target: string, amount: number) => Promise<string> };
  return qr(promptpayNumber, amount);
}

/**
 * Legacy pipe format — used when no PromptPay number is configured.
 * Format: apartmentName|roomNo|period|amount
 */
export function buildLegacyPayload(
  apartmentName: string,
  roomNo: string,
  period: string,
  amount: number,
): string {
  return `${apartmentName}|${roomNo}|${period}|${amount.toFixed(2)}`;
}
