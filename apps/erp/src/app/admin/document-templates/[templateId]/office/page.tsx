import { redirect } from 'next/navigation';

export default function LegacyDocumentTemplateOfficePage({
  params,
}: {
  params: { templateId: string };
}) {
  redirect(`/admin/templates/${params.templateId}/edit`);
}
