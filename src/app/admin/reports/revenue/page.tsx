import { redirect } from 'next/navigation';

export default function ReportsRevenuePage() {
  redirect('/admin/reports?tab=revenue');
}
