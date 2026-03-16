import { redirect } from 'next/navigation';

export default function LegacyDocumentTemplateEditPage({
  params,
}: {
  params: { templateId: string };
}) {
  redirect(`/admin/templates/${params.templateId}/edit`);
}
