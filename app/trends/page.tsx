import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import TrendsPageShell from '@/components/trends-page-shell';

export default async function TrendsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/sign-in');
  }

  return (
    <main className="page">
      <header>
        <p className="eyebrow">Golfcoachr10</p>
        <h1>Club Trends</h1>
        <p>Compare club metrics over time windows using persisted session stats.</p>
      </header>

      <div className="dashboard-actions">
        <Link href="/dashboard">Back to dashboard</Link>
        <Link href="/">Back home</Link>
      </div>

      <TrendsPageShell />
    </main>
  );
}
