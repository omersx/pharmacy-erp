import { redirect } from '@/i18n/routing';

export default function RootPage() {
  // Simple redirect to dashboard, in real app check auth state
  redirect({ href: '/dashboard', locale: 'en' });
}
