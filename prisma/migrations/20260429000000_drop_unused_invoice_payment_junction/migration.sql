-- Migration: Drop unused Invoice<->Payment junction table
-- The Invoice<->Payment relationship is managed through PaymentMatch, not a direct junction.
-- The _InvoiceToPayment table was created by Prisma but never used (0 rows).

DROP TABLE IF EXISTS "_InvoiceToPayment" CASCADE;
