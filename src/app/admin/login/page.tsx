import { redirect } from 'next/navigation';

/**
 * /admin/login is a common URL users might type.
 * Redirect them to the actual login page at /login.
 */
export default function AdminLoginRedirect() {
  redirect('/login');
}
