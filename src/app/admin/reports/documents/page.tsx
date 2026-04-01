import { redirect } from 'next/navigation';

export default function ReportsDocumentsPage() {
  // No documents tab exists in parent; redirect to overview
  redirect('/admin/reports');
}
