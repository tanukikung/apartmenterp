import Link from 'next/link';
import { ArrowLeft, TableProperties } from 'lucide-react';
import { OnlyOfficeFrame } from '@/components/onlyoffice/OnlyOfficeFrame';

export default function BillingBatchOfficePage({
  params,
}: {
  params: { batchId: string };
}) {
  return (
    <main className="space-y-6">
      <section className="rounded-2xl border border-outline-variant/10 bg-gradient-to-br from-primary-container to-primary px-6 py-5">
        <div className="flex items-center gap-4">
          <Link href={`/admin/billing/batches/${params.batchId}`} className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container">
            <ArrowLeft className="h-4 w-4" />
            Batch Detail
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-on-primary">ONLYOFFICE Workbook Editor</h1>
            <p className="text-sm text-on-primary/80">
              Edit the source Excel workbook directly in ONLYOFFICE. Saving refreshes the staged batch rows automatically.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4">
          <Link href={`/admin/billing/batches/${params.batchId}`} className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container">
            <TableProperties className="h-4 w-4" />
            Back To Validation Table
          </Link>
        </div>
      </section>

      <OnlyOfficeFrame configUrl={`/api/onlyoffice/billing-batches/${params.batchId}/config`} />
    </main>
  );
}
