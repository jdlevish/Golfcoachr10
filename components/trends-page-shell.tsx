'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { CoachV2Plan } from '@/types/coach';

type ClubTrendPoint = {
  sessionId: string;
  date: string;
  club: string;
  carryMedian: number | null;
  carryStdDev: number | null;
  offlineStdDev: number | null;
  smashMedian: number | null;
  faceToPathMean: number | null;
  topMissShape: string | null;
};

type AllTimePayload = {
  sessionsCount: number;
  summary: {
    clubs: Array<{
      displayName: string;
    }>;
  };
  coachV2Plan: CoachV2Plan | null;
  trendDeltas: {
    summary: string;
  } | null;
  periodComparison: {
    clubs: Array<{
      club: string;
      carryMedianChange: {
        previous: number | null;
        current: number | null;
        delta: number | null;
      };
      offlineStdDevChange: {
        previous: number | null;
        current: number | null;
        delta: number | null;
      };
    }>;
  } | null;
};

type ProgressMetricCard = {
  title: string;
  before: string;
  after: string;
  trendLabel: string;
  trendPositive: boolean;
};

type NavItem = {
  label: string;
  href: string;
  active?: boolean;
};

const navItems: NavItem[] = [
  { label: 'Home', href: '/' },
  { label: 'Practice', href: '/range-mode' },
  { label: 'Sessions', href: '/dashboard' },
  { label: 'Progress', href: '/trends', active: true },
  { label: 'More', href: '/course-mode' }
];

const placeholderCards: ProgressMetricCard[] = [
  {
    title: 'Direction Control',
    before: '+/-18y',
    after: '+/-15y',
    trendLabel: '+17%',
    trendPositive: true
  },
  {
    title: 'Carry Consistency',
    before: '9.0y',
    after: '7.0y',
    trendLabel: '+22%',
    trendPositive: true
  },
  {
    title: 'Strike Quality',
    before: '1.28',
    after: '1.32',
    trendLabel: '+3%',
    trendPositive: true
  }
];

const formatDeltaPct = (before: number | null, after: number | null, lowerIsBetter: boolean) => {
  if (before === null || after === null || before === 0) {
    return { label: 'Building baseline', positive: true };
  }

  const delta = lowerIsBetter ? ((before - after) / before) * 100 : ((after - before) / before) * 100;
  const rounded = Math.round(delta);

  if (rounded > 0) return { label: `+${rounded}%`, positive: true };
  if (rounded < 0) return { label: `${rounded}%`, positive: false };
  return { label: 'Flat', positive: true };
};

const formatValue = (value: number | null, suffix = '') => {
  if (value === null) return '--';
  return `${value.toFixed(suffix ? 1 : 2)}${suffix}`;
};

function SimpleIcon({ kind }: { kind: 'home' | 'practice' | 'sessions' | 'progress' | 'more' }) {
  const paths = {
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

function ProgressCard({ card }: { card: ProgressMetricCard }) {
  return (
    <article className="card progress-metric-card">
      <div className="card-header">
        <div>
          <h2 className="card-title">{card.title}</h2>
        </div>
      </div>
      <div className="progress-metric-body">
        <p className="progress-metric-values">
          <span>{card.before}</span>
          <span className="progress-metric-arrow">to</span>
          <strong>{card.after}</strong>
        </p>
        <p className={card.trendPositive ? 'progress-trend positive' : 'progress-trend negative'}>
          {card.trendPositive ? 'Improving' : 'Needs attention'} {card.trendLabel}
        </p>
      </div>
    </article>
  );
}

export default function TrendsPageShell() {
  const [overview, setOverview] = useState<AllTimePayload | null>(null);
  const [series, setSeries] = useState<ClubTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const loadOverview = async () => {
      try {
        setLoading(true);
        setError(null);

        const overviewResponse = await fetch('/api/sessions/all-time?window=1m', {
          cache: 'no-store',
          signal: controller.signal
        });

        if (!overviewResponse.ok) {
          throw new Error('Could not load progress overview.');
        }

        const overviewPayload = (await overviewResponse.json()) as AllTimePayload;
        if (controller.signal.aborted) return;
        setOverview(overviewPayload);

        const focusClub =
          overviewPayload.coachV2Plan?.primaryConstraint.focusClub ?? overviewPayload.summary.clubs[0]?.displayName ?? '';

        if (!focusClub) {
          setSeries([]);
          setLoading(false);
          return;
        }

        const params = new URLSearchParams({ club: focusClub, range: '30d' });
        const seriesResponse = await fetch(`/api/sessions/trends/club?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal
        });

        if (!seriesResponse.ok) {
          setSeries([]);
          setLoading(false);
          return;
        }

        const seriesPayload = (await seriesResponse.json()) as { series: ClubTrendPoint[] };
        if (!controller.signal.aborted) {
          setSeries(seriesPayload.series ?? []);
          setLoading(false);
        }
      } catch (caughtError) {
        if ((caughtError as Error).name === 'AbortError') return;
        setError('Showing placeholder progress until more trend data is available.');
        setLoading(false);
      }
    };

    void loadOverview();

    return () => controller.abort();
  }, []);

  const metricCards = useMemo(() => {
    if (series.length < 2) return placeholderCards;

    const sorted = [...series].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    const directionTrend = formatDeltaPct(first.offlineStdDev, last.offlineStdDev, true);
    const carryTrend = formatDeltaPct(first.carryStdDev, last.carryStdDev, true);
    const strikeTrend = formatDeltaPct(first.smashMedian, last.smashMedian, false);

    return [
      {
        title: 'Direction Control',
        before: formatValue(first.offlineStdDev, 'y'),
        after: formatValue(last.offlineStdDev, 'y'),
        trendLabel: directionTrend.label,
        trendPositive: directionTrend.positive
      },
      {
        title: 'Carry Consistency',
        before: formatValue(first.carryStdDev, 'y'),
        after: formatValue(last.carryStdDev, 'y'),
        trendLabel: carryTrend.label,
        trendPositive: carryTrend.positive
      },
      {
        title: 'Strike Quality',
        before: formatValue(first.smashMedian),
        after: formatValue(last.smashMedian),
        trendLabel: strikeTrend.label,
        trendPositive: strikeTrend.positive
      }
    ];
  }, [series]);

  const streakLabel = overview ? `${overview.sessionsCount} Sessions` : '6 Sessions';
  const bestClub = useMemo(() => {
    const clubs = overview?.periodComparison?.clubs ?? [];
    if (!clubs.length) {
      return {
        title: 'Best Club',
        copy: '7 Iron tightened direction by 3.0y over the month.'
      };
    }

    const standout = clubs
      .slice()
      .sort((a, b) => (a.offlineStdDevChange.delta ?? 0) - (b.offlineStdDevChange.delta ?? 0))[0];

    if (!standout) {
      return {
        title: 'Best Club',
        copy: 'Your next standout session will show here.'
      };
    }

    const delta = standout.offlineStdDevChange.delta ?? 0;
    return {
      title: 'Best Club',
      copy:
        delta < 0
          ? `${standout.club} tightened direction by ${Math.abs(delta).toFixed(1)}y.`
          : `${standout.club} is your current benchmark club.`
    };
  }, [overview?.periodComparison?.clubs]);

  return (
    <main className="page-shell progress-overview-page">
      <header className="top-bar progress-top-bar">
        <div>
          <h1 className="progress-page-title">Progress Overview</h1>
          <p className="progress-page-subtitle">Last 30 Days</p>
        </div>
      </header>

      {error ? <p className="helper-text">{error}</p> : null}
      {loading ? <p className="helper-text">Loading progress snapshot...</p> : null}

      <div className="progress-overview-stack">
        <section className="section">
          {metricCards.map((card) => (
            <ProgressCard key={card.title} card={card} />
          ))}
        </section>

        <article className="card progress-streak-card">
          <div className="progress-streak-badge">Practice Streak</div>
          <p className="progress-streak-value">{streakLabel}</p>
          <p className="progress-streak-copy">
            {overview?.trendDeltas?.summary ?? 'You are building real momentum. Keep stacking focused sessions.'}
          </p>
        </article>

        <article className="card progress-highlight-card">
          <div className="card-header">
            <div>
              <h2 className="card-title">{bestClub.title}</h2>
            </div>
          </div>
          <p className="progress-highlight-copy">{bestClub.copy}</p>
        </article>
      </div>

      <nav className="bottom-nav progress-bottom-nav" aria-label="Primary">
        {navItems.map((item) => (
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
