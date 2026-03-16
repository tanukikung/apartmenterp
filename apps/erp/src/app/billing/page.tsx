import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Billing',
};

export default function BillingPage() {
  redirect('/admin/billing');
}
