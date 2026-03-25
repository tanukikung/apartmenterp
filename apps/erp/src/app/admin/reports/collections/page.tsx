import { redirect } from 'next/navigation';

export default function ReportsCollectionsPage() {
  redirect('/admin/reports?tab=collections');
}
