import type { ReactNode } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { AppBottomNav, AppCard, AppHeaderBar, AppIcon, AppPageShell, buildPrimaryNav } from '@/components/app-shell';

type HomeDashboardProps = {
  isSignedIn: boolean;
  userName: string;
  greeting: string;
};

type DashboardCardProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

type ActionButtonProps = {
  href: Route;
  label: string;
  variant?: 'primary' | 'secondary';
};

const practicePlan = ['Alignment Gate', 'Face Control Drill', 'Random Target Challenge'];

const progressRows = [
  { label: 'Direction', from: '18y', to: '15y' },
  { label: 'Carry Consistency', from: '9y', to: '7y' },
  { label: 'Strike Pattern', from: 'Wide', to: 'Tighter' }
];

function DashboardCard({ title, subtitle, children }: DashboardCardProps) {
  return <AppCard title={title} subtitle={subtitle} className="home-card" bodyClassName="home-card-body">{children}</AppCard>;
}

function ActionButton({ href, label, variant = 'primary' }: ActionButtonProps) {
  const className = variant === 'primary' ? 'primary-button' : 'secondary-button';

  return (
    <Link href={href} className={className}>
      {label}
    </Link>
  );
}

export default function HomeDashboard({ isSignedIn, userName, greeting }: HomeDashboardProps) {
  const primaryHref = '/range-mode';
  const analysisHref = isSignedIn ? '/trends' : '/sign-in';
  const courseHref = isSignedIn ? '/course-mode' : '/sign-in';
  const uploadHref = isSignedIn ? '/dashboard' : '/sign-up';
  const navItems = buildPrimaryNav('Home');

  return (
    <AppPageShell className="home-dashboard">
      <AppHeaderBar
        title={`${greeting}, ${userName}`}
        subtitle={isSignedIn ? 'Coach plan ready for today' : "Preview today's coaching flow"}
        className="home-top-bar"
        trailing={
          <button type="button" className="icon-button home-bell" aria-label="Notifications">
            <AppIcon kind="bell" />
          </button>
        }
      >
        <nav className="home-desktop-nav" aria-label="Primary desktop">
          {navItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={`home-desktop-nav-item${item.active ? ' active' : ''}`}
              aria-current={item.active ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </AppHeaderBar>

      <div className="home-layout">
        <div className="home-stack home-stack-primary">
          <DashboardCard title="Today's Focus">
            <div className="home-focus-block">
              <h1 className="home-focus-title">7 Iron Direction Control</h1>
              <p className="home-focus-text">Reduce dispersion from plus or minus 18y to plus or minus 12y.</p>
            </div>

            <div className="metric-item home-plan-card">
              <div className="metric-row home-plan-header">
                <h3 className="home-mini-title">Practice Plan</h3>
                <span className="card-subtitle">25 min</span>
              </div>
              <ul className="home-bullet-list">
                {practicePlan.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <ActionButton href={primaryHref} label="Start Range Mode" />
          </DashboardCard>

          <DashboardCard title="Last Session">
            <div className="home-session-score">
              <span className="badge badge-success">Session Score</span>
              <strong>78</strong>
            </div>
            <ul className="home-bullet-list home-bullet-list-compact">
              <li>Direction improved by 3y.</li>
            </ul>
            <ActionButton href={analysisHref} label="View Analysis" variant="secondary" />
          </DashboardCard>
        </div>

        <aside className="home-stack home-stack-secondary">
          <DashboardCard title="Quick Tools">
            <div className="quick-action-grid home-quick-actions">
              <Link href={uploadHref} className="secondary-button home-tool-button">
                <AppIcon kind="upload" />
                <span>Upload Session</span>
              </Link>
              <Link href={courseHref} className="secondary-button home-tool-button">
                <AppIcon kind="flag" />
                <span>Course Mode</span>
              </Link>
            </div>
          </DashboardCard>

          <DashboardCard title="Progress Snapshot">
            <div className="section home-progress-list">
              {progressRows.map((row) => (
                <div key={row.label} className="list-row home-progress-row">
                  <span>{row.label}</span>
                  <strong>
                    {row.from} <span className="home-progress-arrow">to</span> {row.to}
                  </strong>
                </div>
              ))}
            </div>
          </DashboardCard>
        </aside>
      </div>

      <AppBottomNav items={navItems} className="home-bottom-nav" />
    </AppPageShell>
  );
}
