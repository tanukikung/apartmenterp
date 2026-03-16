import Link from 'next/link';
import { ArrowLeft, Settings2 } from 'lucide-react';
import { OnlyOfficeFrame } from '@/components/onlyoffice/OnlyOfficeFrame';

export default function DocumentTemplateOfficePage({
  params,
}: {
  params: { templateId: string };
}) {
  return (
    <main className="admin-page">
      <section className="admin-page-header">
        <div className="flex items-center gap-4">
          <Link href="/admin/document-templates" className="admin-button flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Templates
          </Link>
          <div>
            <h1 className="admin-page-title">ONLYOFFICE Template Editor</h1>
            <p className="admin-page-subtitle">
              Edit the template in ONLYOFFICE. Saving in the editor writes the HTML back into the live template record.
            </p>
          </div>
        </div>
        <div className="admin-toolbar">
          <Link href={`/admin/document-templates/${params.templateId}/edit`} className="admin-button flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Template Settings
          </Link>
        </div>
      </section>

      <OnlyOfficeFrame configUrl={`/api/onlyoffice/document-templates/${params.templateId}/config`} />
    </main>
  );
}
