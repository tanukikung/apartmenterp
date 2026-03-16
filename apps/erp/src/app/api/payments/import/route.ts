// Deprecated alias — all new code must use /api/payments/statement-upload.
// This file re-exports the canonical handler so existing callers continue to work
// while we standardise on the new route path.
export { POST } from '../statement-upload/route';
