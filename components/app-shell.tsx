import type { ReactNode } from 'react';
import Link from 'next/link';
import type { Route } from 'next';

export type AppNavItem = {
  label: string;
  href: Route;
  active?: boolean;
};

type AppPageShellProps = {
  children: ReactNode;
  className?: string;
};

type AppHeaderBarProps = {
  title: string;
  subtitle?: string;
  titleTag?: 'h1' | 'h2' | 'h3';
  backHref?: Route;
  onBack?: () => void;
  trailing?: ReactNode;
  children?: ReactNode;
  className?: string;
};

type AppCardProps = {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

type AppBottomNavProps = {
  items: AppNavItem[];
  className?: string;
};

type AppIconKind =
  | 'back'
  | 'bell'
  | 'upload'
  | 'flag'
  | 'home'
  | 'practice'
  | 'sessions'
  | 'progress'
  | 'more';

const appIconPaths: Record<AppIconKind, string> = {
  back: 'M14.78 5.97 8.75 12l6.03 6.03-1.59 1.59L5.56 12l7.63-7.62 1.59 1.59Z',
  bell:
    'M12 3.75a4.75 4.75 0 0 0-4.75 4.75v2.17c0 .64-.2 1.27-.57 1.79l-1.18 1.68a1.5 1.5 0 0 0 1.22 2.37h10.56a1.5 1.5 0 0 0 1.22-2.37l-1.18-1.68a3.12 3.12 0 0 1-.57-1.79V8.5A4.75 4.75 0 0 0 12 3.75Zm0 16.5a2.23 2.23 0 0 1-2.08-1.43h4.16A2.23 2.23 0 0 1 12 20.25Z',
  upload: 'M12 4.5 7.5 9h3v5h3V9h3L12 4.5ZM6 15.75h12v2.25H6v-2.25Z',
  flag: 'M7.5 4.5h8.36l-1.4 2.53 1.4 2.47H9.75v4.5h-2.25V4.5Z',
  home: 'M4.5 10.5 12 5.25l7.5 5.25v8.25h-4.5v-4.5h-6v4.5H4.5V10.5Z',
  practice: 'M5.25 6.75h13.5v10.5H5.25V6.75Zm2.25 2.25v6h9v-6h-9Z',
  sessions: 'M6 6h12v3H6V6Zm0 4.5h12v7.5H6v-7.5Z',
  progress: 'M6 17.25V12h2.25v5.25H6Zm4.88 0v-9h2.25v9h-2.25Zm4.87 0v-6.75H18v6.75h-2.25Z',
  more: 'M6.75 12a1.5 1.5 0 1 1 0-.01V12Zm5.25 0a1.5 1.5 0 1 1 0-.01V12Zm5.25 0a1.5 1.5 0 1 1 0-.01V12Z'
};

const navIconKindForLabel = (label: string): AppIconKind => {
  if (label === 'Home') return 'home';
  if (label === 'Practice') return 'practice';
  if (label === 'Sessions') return 'sessions';
  if (label === 'Progress') return 'progress';
  return 'more';
};

const joinClasses = (...values: Array<string | undefined | false>) => values.filter(Boolean).join(' ');

export function AppIcon({ kind }: { kind: AppIconKind }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={appIconPaths[kind]} fill="currentColor" />
    </svg>
  );
}

export function AppPageShell({ children, className }: AppPageShellProps) {
  return <main className={joinClasses('page-shell app-shell', className)}>{children}</main>;
}

export function AppTitleBlock({
  title,
  subtitle,
  titleTag = 'h1'
}: {
  title: string;
  subtitle?: string;
  titleTag?: 'h1' | 'h2' | 'h3';
}) {
  const TitleTag = titleTag;

  return (
    <div className="app-title-block">
      <TitleTag className="app-page-title">{title}</TitleTag>
      {subtitle ? <p className="app-page-subtitle">{subtitle}</p> : null}
    </div>
  );
}

export function AppHeaderBar({
  title,
  subtitle,
  titleTag,
  backHref,
  onBack,
  trailing,
  children,
  className
}: AppHeaderBarProps) {
  const titleBlock = <AppTitleBlock title={title} subtitle={subtitle} titleTag={titleTag} />;
  const leading = backHref ? (
    <Link href={backHref} className="icon-button app-back-button" aria-label="Back">
      <AppIcon kind="back" />
    </Link>
  ) : onBack ? (
    <button type="button" className="icon-button app-back-button" onClick={onBack} aria-label="Back">
      <AppIcon kind="back" />
    </button>
  ) : (
    <div className="app-header-side" aria-hidden="true" />
  );
  const trailingSlot = trailing ? <div className="app-header-trailing">{trailing}</div> : <div className="app-header-side" aria-hidden="true" />;

  return (
    <header className={joinClasses('top-bar app-header-bar', className)}>
      {leading}
      <div className="app-header-main">
        {titleBlock}
        {children}
      </div>
      {trailingSlot}
    </header>
  );
}

export function AppCard({ title, subtitle, children, className, bodyClassName }: AppCardProps) {
  return (
    <section className={joinClasses('card app-card', className)}>
      {title ? (
        <div className="card-header app-card-header">
          <div>
            <h2 className="card-title">{title}</h2>
            {subtitle ? <p className="card-subtitle">{subtitle}</p> : null}
          </div>
        </div>
      ) : null}
      <div className={joinClasses('app-card-body', bodyClassName)}>{children}</div>
    </section>
  );
}

export function AppBottomNav({ items, className }: AppBottomNavProps) {
  return (
    <nav className={joinClasses('bottom-nav app-bottom-nav', className)} aria-label="Primary">
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className={`bottom-nav-item${item.active ? ' active' : ''}`}
          aria-current={item.active ? 'page' : undefined}
        >
          <AppIcon kind={navIconKindForLabel(item.label)} />
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

export const buildPrimaryNav = (activeLabel: AppNavItem['label']) =>
  [
    { label: 'Home', href: '/' as Route },
    { label: 'Practice', href: '/range-mode' as Route },
    { label: 'Sessions', href: '/dashboard' as Route },
    { label: 'Progress', href: '/trends' as Route },
    { label: 'More', href: '/course-mode' as Route }
  ].map((item) => ({ ...item, active: item.label === activeLabel }));
