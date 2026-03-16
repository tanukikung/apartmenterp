# Known Limitations

These are intentional constraints, non-blocking risks, and simplified modules documented at release. None prevent the system from being deployed and used commercially. Items that require a future sprint are noted.

---

## External Service Dependencies

### LINE Messaging API
- **Requires:** `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET`, `LINE_ACCESS_TOKEN` (all three).
- **Without credentials:** all LINE-dependent paths (invoice send, payment reminders, chat reply) complete without error but messages are not delivered. Outbox events and audit log entries are still created.
- **Webhook:** the LINE webhook endpoint (`POST /api/line/webhook`) rejects requests with an invalid `x-line-signature`. Without a valid channel secret, incoming tenant messages are silently dropped.
- **LINE User linking:** tenants must have initiated a conversation with the bot before the system can push messages to them. New tenants receive no LINE messages until they add the bot as a friend.

### File Storage
- `STORAGE_DRIVER=local` stores uploads in `UPLOAD_DIR` (defaults to OS temp). Files do not survive container or serverless restarts without a persistent volume mount.
- `STORAGE_DRIVER=supabase` is in the enum but is not implemented. Setting it causes all file operations to throw `'Storage driver not configured'`. Use `local` or `s3`.
- `STORAGE_DRIVER=s3` is fully implemented but requires `S3_BUCKET` and valid AWS credentials at startup.

### Redis
- Optional. Without `REDIS_URL`, the outbox processor runs in-process. Messages are not lost during normal operation, but any in-flight events at the time of a process crash are not retried. For high-reliability deployments, configure Redis.

---

## Intentional Constraints

### Message Template Variable Interpolation
- Template bodies are stored as plain text and passed to outbox events as-is.
- The UI placeholder text shows `{{tenant_name}}`, `{{room_number}}` etc. as examples, but **variable substitution is not implemented** in the outbox processor or LINE client. The raw template body is delivered verbatim.
- Impact: templates must be written with static text. Dynamic personalisation (tenant name in the message body) requires a future implementation of the interpolation step in the outbox processor.

### Invoice Send Channel: PDF and PRINT
- The `sendInvoiceSchema` accepts `channel: 'LINE' | 'PDF' | 'PRINT'`.
- Only `LINE` results in an actual dispatched message. `PDF` and `PRINT` record an `InvoiceDelivery` row with `status: SENT` but do not trigger any delivery mechanism (no email, no print queue).
- These channels are schema-complete stubs for future implementation.

### Documents Report — Contracts Count
- `/admin/reports/documents` shows `Contracts Created: 0` unconditionally. The contracts model exists and is operational, but the documents report does not query it. This is a known placeholder (`const contractsCreated = 0`).

### Tenant Delete
- The `DELETE /api/tenants/[id]` endpoint has no implementation. A `// TODO` comment marks where cascade-safe delete logic would go. Attempting to delete a tenant returns a method or not-implemented response. Tenants with active contracts must be deactivated, not deleted.

### In-Process Rate Limiting
- Rate limiting (default: 120 req/min per IP) is tracked in-process memory, not a shared store. On multi-instance deployments, each instance has its own counter. A client can exceed the limit by distributing requests across instances. Use an edge or infrastructure-level rate limiter for multi-instance setups.

### Cron Jobs — Single Instance Only
- `CRON_ENABLED=true` registers jobs inside the Next.js server process. Running multiple app instances with cron enabled causes duplicate job execution (billing generated twice, reminders sent twice). Set `CRON_ENABLED=false` on all but one instance, or use an external scheduler hitting the cron endpoints with `x-cron-secret`.

### Bank Statement Parser
- The CSV/Excel parser uses heuristic column detection (finds columns named or resembling `date`, `amount`, `reference`).
- Standard formats from major Thai banks (SCB, KBANK, BBL) work out of the box.
- Non-standard or bank-specific exports may fail column detection and return `'Could not detect required columns'`. Manual column mapping is not available in the UI; the CSV must be reformatted to match the expected schema.

---

## Operational but Simplified

| Module | Status | Simplification |
|--------|--------|----------------|
| Payment auto-matching | Operational | Matches by exact amount + date proximity. No fuzzy matching on reference strings. |
| Backup scheduler | Operational | Schedules `pg_dump` via cron. No incremental backup, no S3 upload of backups. |
| Overdue check | Operational | Marks invoices overdue by day-of-month threshold. No grace period logic. |
| Audit log | Operational | All high-value actions logged. No log rotation or archival. |
| Multi-building | Schema-ready | `Building` model exists, seed creates one building. UI is single-building only. |
| Email delivery | Not implemented | No email transport. All tenant notifications go through LINE only. |
| Tenant self-service portal | Not implemented | Tenants interact via LINE bot only. No web portal for tenants. |
| Two-factor authentication | Not implemented | Username/password only. |
| Invoice versioning (UI) | Partial | Version number stored and displayed. Side-by-side diff view not implemented. |

---

## Non-Blocking Risks

| Risk | Likelihood | Workaround |
|------|-----------|------------|
| Outbox event loss on crash (no Redis) | Low in single-instance | Configure Redis or accept manual re-send |
| Bank CSV format mismatch | Medium for non-standard banks | Pre-process CSV to match expected column names before uploading |
| Cron double-fire on multi-instance | High if misconfigured | Disable cron on all but one instance |
| Local file uploads lost on container restart | Certain without volume | Mount persistent volume at `UPLOAD_DIR` or use S3 |
| Migration down-scripts absent | Low (handled by backup/restore) | Always backup before `prisma migrate deploy` |
