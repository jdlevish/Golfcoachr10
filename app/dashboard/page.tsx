import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth, signOut } from '@/auth';
import { AppBottomNav, AppCard, AppHeaderBar, AppPageShell, buildPrimaryNav } from '@/components/app-shell';
import DashboardShell from '@/components/dashboard-shell';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/sign-in');
  }

  const navItems = buildPrimaryNav('Sessions');

  return (
    <AppPageShell className="dashboard-page">
      <AppHeaderBar title="Sessions" subtitle={session.user.email ?? 'Signed in'} className="dashboard-top-bar" />

      <AppCard title="Session Tools" subtitle="Import new sessions, manage settings, and review saved practice." className="dashboard-hero-card">
        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/' });
          }}
          className="dashboard-signout-form"
        >
          <button type="submit" className="secondary-button">
            Sign out
          </button>
        </form>
        <div className="dashboard-actions dashboard-page-links">
          <Link href="/trends" className="secondary-button">
            View trends
          </Link>
          <a href="/course-mode" className="secondary-button">
            Course mode
          </a>
          <Link href="/" className="secondary-button">
            Back home
          </Link>
        </div>
      </AppCard>

      <DashboardShell />
      <AppBottomNav items={navItems} className="dashboard-bottom-nav" />
    </AppPageShell>
  );
}
