import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth, signOut } from '@/auth';
import DashboardShell from '@/components/dashboard-shell';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/sign-in');
  }

  return (
    <main className="page">
      <header>
        <p className="eyebrow">Golfcoachr10</p>
        <h1>Range Session Dashboard</h1>
        <p>Signed in as {session.user.email}</p>
      </header>

      <div className="dashboard-actions">
        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/' });
          }}
        >
          <button type="submit">Sign out</button>
        </form>
        <Link href="/">Back home</Link>
      </div>

      <DashboardShell />
    </main>
  );
}
