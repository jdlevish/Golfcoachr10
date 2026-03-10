import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import TrendsPageShell from '@/components/trends-page-shell';

export default async function TrendsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/sign-in');
  }

  return <TrendsPageShell />;
}
