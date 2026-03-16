import Link from 'next/link';
import { ArrowLeft, TableProperties } from 'lucide-react';
import { OnlyOfficeFrame } from '@/components/onlyoffice/OnlyOfficeFrame';

export default function BillingBatchOfficePage({
  params,
}: {
  params: { batchId: string };
}) {
  return (
    <main className="admin-page">
      <section className="admin-page-header">
        <div className="flex items-center gap-4">
          <Link href={`/admin/billing/batches/${params.batchId}`} className="admin-button flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Batch Detail
          </Link>
          <div>
            <h1 className="admin-page-title">ONLYOFFICE Workbook Editor</h1>
            <p className="admin-page-subtitle">
              Edit the source Excel workbook directly in ONLYOFFICE. Saving refreshes the staged batch rows automatically.
            </p>
          </div>
        </div>
        <div className="admin-toolbar">
          <Link href={`/admin/billing/batches/${params.batchId}`} className="admin-button flex items-center gap-2">
            <TableProperties className="h-4 w-4" />
            Back To Validation Table
          </Link>
        </div>
      </section>

      <OnlyOfficeFrame configUrl={`/api/onlyoffice/billing-batches/${params.batchId}/config`} />
    </main>
  );
}
