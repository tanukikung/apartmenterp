import { redirect } from 'next/navigation';

export default function ReportsOccupancyPage() {
  redirect('/admin/reports?tab=occupancy');
}
