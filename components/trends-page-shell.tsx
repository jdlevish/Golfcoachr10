'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CoachV2Plan } from '@/types/coach';
import { AppBottomNav, AppCard, AppHeaderBar, AppPageShell, buildPrimaryNav } from '@/components/app-shell';

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

function ProgressCard({ card }: { card: ProgressMetricCard }) {
  return (
    <AppCard title={card.title} className="progress-metric-card" bodyClassName="progress-metric-body">
        <p className="progress-metric-values">
          <span>{card.before}</span>
          <span className="progress-metric-arrow">to</span>
          <strong>{card.after}</strong>
        </p>
        <p className={card.trendPositive ? 'progress-trend positive' : 'progress-trend negative'}>
          {card.trendPositive ? 'Improving' : 'Needs attention'} {card.trendLabel}
        </p>
    </AppCard>
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
  const navItems = buildPrimaryNav('Progress');

  return (
    <AppPageShell className="progress-overview-page">
      <AppHeaderBar title="Progress Overview" subtitle="Last 30 Days" className="progress-top-bar" />

      {error ? <p className="helper-text">{error}</p> : null}
      {loading ? <p className="helper-text">Loading progress snapshot...</p> : null}

      <div className="progress-overview-stack">
        <section className="section">
          {metricCards.map((card) => (
            <ProgressCard key={card.title} card={card} />
          ))}
        </section>

        <AppCard className="progress-streak-card" bodyClassName="progress-streak-body">
          <div className="progress-streak-badge">Practice Streak</div>
          <p className="progress-streak-value">{streakLabel}</p>
          <p className="progress-streak-copy">
            {overview?.trendDeltas?.summary ?? 'You are building real momentum. Keep stacking focused sessions.'}
          </p>
        </AppCard>

        <AppCard title={bestClub.title} className="progress-highlight-card" bodyClassName="progress-highlight-body">
          <p className="progress-highlight-copy">{bestClub.copy}</p>
        </AppCard>
      </div>

      <AppBottomNav items={navItems} className="progress-bottom-nav" />
    </AppPageShell>
  );
}
