import type { ReactNode } from 'react';
import Link from 'next/link';

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
  href: string;
  label: string;
  variant?: 'primary' | 'secondary';
};

type BottomNavItem = {
  label: string;
  href: string;
  active?: boolean;
};

const practicePlan = ['Alignment Gate', 'Face Control Drill', 'Random Target Challenge'];

const progressRows = [
  { label: 'Direction', from: '18y', to: '15y' },
  { label: 'Carry Consistency', from: '9y', to: '7y' },
  { label: 'Strike Pattern', from: 'Wide', to: 'Tighter' }
];

const bottomNavItems: BottomNavItem[] = [
  { label: 'Home', href: '/', active: true },
  { label: 'Practice', href: '/range-mode' },
  { label: 'Sessions', href: '/dashboard' },
  { label: 'Progress', href: '/trends' },
  { label: 'More', href: '/course-mode' }
];

function DashboardCard({ title, subtitle, children }: DashboardCardProps) {
  return (
    <section className="card home-card">
      <div className="card-header">
        <div>
          <h2 className="card-title">{title}</h2>
          {subtitle ? <p className="card-subtitle">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function ActionButton({ href, label, variant = 'primary' }: ActionButtonProps) {
  const className = variant === 'primary' ? 'primary-button' : 'secondary-button';

  return (
    <Link href={href} className={className}>
      {label}
    </Link>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3.75a4.75 4.75 0 0 0-4.75 4.75v2.17c0 .64-.2 1.27-.57 1.79l-1.18 1.68a1.5 1.5 0 0 0 1.22 2.37h10.56a1.5 1.5 0 0 0 1.22-2.37l-1.18-1.68a3.12 3.12 0 0 1-.57-1.79V8.5A4.75 4.75 0 0 0 12 3.75Zm0 16.5a2.23 2.23 0 0 1-2.08-1.43h4.16A2.23 2.23 0 0 1 12 20.25Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SimpleIcon({ kind }: { kind: 'upload' | 'flag' | 'home' | 'practice' | 'sessions' | 'progress' | 'more' }) {
  const paths = {
    upload: 'M12 4.5 7.5 9h3v5h3V9h3L12 4.5ZM6 15.75h12v2.25H6v-2.25Z',
    flag: 'M7.5 4.5h8.36l-1.4 2.53 1.4 2.47H9.75v4.5h-2.25V4.5Z',
    home: 'M4.5 10.5 12 5.25l7.5 5.25v8.25h-4.5v-4.5h-6v4.5H4.5V10.5Z',
    practice: 'M5.25 6.75h13.5v10.5H5.25V6.75Zm2.25 2.25v6h9v-6h-9Z',
    sessions: 'M6 6h12v3H6V6Zm0 4.5h12v7.5H6v-7.5Z',
    progress: 'M6 17.25V12h2.25v5.25H6Zm4.88 0v-9h2.25v9h-2.25Zm4.87 0v-6.75H18v6.75h-2.25Z',
    more: 'M6.75 12a1.5 1.5 0 1 1 0-.01V12Zm5.25 0a1.5 1.5 0 1 1 0-.01V12Zm5.25 0a1.5 1.5 0 1 1 0-.01V12Z'
  } as const;

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[kind]} fill="currentColor" />
    </svg>
  );
}

export default function HomeDashboard({ isSignedIn, userName, greeting }: HomeDashboardProps) {
  const primaryHref = '/range-mode';
  const analysisHref = isSignedIn ? '/trends' : '/sign-in';
  const courseHref = isSignedIn ? '/course-mode' : '/sign-in';
  const uploadHref = isSignedIn ? '/dashboard' : '/sign-up';

  return (
    <main className="page-shell home-dashboard">
      <header className="top-bar home-top-bar">
        <div className="home-top-bar-copy">
          <p className="home-greeting">{greeting}, {userName}</p>
          <p className="home-status">{isSignedIn ? 'Coach plan ready for today' : 'Preview today\'s coaching flow'}</p>
        </div>

        <nav className="home-desktop-nav" aria-label="Primary desktop">
          {bottomNavItems.map((item) => (
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

        <button type="button" className="icon-button home-bell" aria-label="Notifications">
          <BellIcon />
        </button>
      </header>

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
                <SimpleIcon kind="upload" />
                <span>Upload Session</span>
              </Link>
              <Link href={courseHref} className="secondary-button home-tool-button">
                <SimpleIcon kind="flag" />
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

      <nav className="bottom-nav home-bottom-nav" aria-label="Primary">
        {bottomNavItems.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={`bottom-nav-item${item.active ? ' active' : ''}`}
            aria-current={item.active ? 'page' : undefined}
          >
            <SimpleIcon
              kind={
                item.label === 'Home'
                  ? 'home'
                  : item.label === 'Practice'
                    ? 'practice'
                    : item.label === 'Sessions'
                      ? 'sessions'
                      : item.label === 'Progress'
                        ? 'progress'
                        : 'more'
              }
            />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
