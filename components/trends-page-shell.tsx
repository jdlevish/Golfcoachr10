'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CoachV2Plan } from '@/types/coach';
import { AppBottomNav, AppCard, AppHeaderBar, AppPageShell, buildPrimaryNav } from '@/components/app-shell';

type ProgressRange = '1w' | '1m' | '1y';

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
      carryStdDevChange: {
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
    currentPeriod: {
      from: string;
      to: string;
      sessions: number;
      avgShotCount: number | null;
    };
    previousPeriod: {
      from: string;
      to: string;
      sessions: number;
      avgShotCount: number | null;
    };
    sessionFrequencyChange: {
      previous: number;
      current: number;
      delta: number;
      deltaPct: number | null;
    };
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

const progressRangeOptions: Array<{ value: ProgressRange; label: string; subtitle: string; seriesRange: string }> = [
  { value: '1w', label: 'Week', subtitle: 'This Week vs Previous Week', seriesRange: '7d' },
  { value: '1m', label: 'Month', subtitle: 'This Month vs Previous Month', seriesRange: '30d' },
  { value: '1y', label: 'Year', subtitle: 'This Year vs Previous Year', seriesRange: '1y' }
];

const getProgressRangeConfig = (range: ProgressRange) =>
  progressRangeOptions.find((option) => option.value === range) ?? progressRangeOptions[1];

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
  const [selectedRange, setSelectedRange] = useState<ProgressRange>('1m');
  const [overview, setOverview] = useState<AllTimePayload | null>(null);
  const [series, setSeries] = useState<ClubTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeRange = getProgressRangeConfig(selectedRange);

  useEffect(() => {
    const controller = new AbortController();

    const loadOverview = async () => {
      try {
        setLoading(true);
        setError(null);

        const overviewResponse = await fetch(`/api/sessions/all-time?window=${selectedRange}`, {
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

        const params = new URLSearchParams({ club: focusClub, range: activeRange.seriesRange });
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
  }, [activeRange.seriesRange, selectedRange]);

  const comparisonClub = useMemo(() => {
    const clubs = overview?.periodComparison?.clubs ?? [];
    if (!clubs.length) return null;

    const focusClub = overview?.coachV2Plan?.primaryConstraint.focusClub;
    return (
      clubs.find((club) => club.club.toLowerCase() === focusClub?.toLowerCase()) ??
      clubs
        .slice()
        .sort((a, b) => (a.offlineStdDevChange.delta ?? 0) - (b.offlineStdDevChange.delta ?? 0))[0] ??
      null
    );
  }, [overview?.coachV2Plan?.primaryConstraint.focusClub, overview?.periodComparison?.clubs]);

  const metricCards = useMemo(() => {
    if (comparisonClub) {
      const directionTrend = formatDeltaPct(
        comparisonClub.offlineStdDevChange.previous,
        comparisonClub.offlineStdDevChange.current,
        true
      );
      const carryTrend = formatDeltaPct(
        comparisonClub.carryStdDevChange.previous,
        comparisonClub.carryStdDevChange.current,
        true
      );
      const distanceTrend = formatDeltaPct(
        comparisonClub.carryMedianChange.previous,
        comparisonClub.carryMedianChange.current,
        false
      );

      return [
        {
          title: 'Direction Control',
          before: formatValue(comparisonClub.offlineStdDevChange.previous, 'y'),
          after: formatValue(comparisonClub.offlineStdDevChange.current, 'y'),
          trendLabel: directionTrend.label,
          trendPositive: directionTrend.positive
        },
        {
          title: 'Carry Consistency',
          before: formatValue(comparisonClub.carryStdDevChange.previous, 'y'),
          after: formatValue(comparisonClub.carryStdDevChange.current, 'y'),
          trendLabel: carryTrend.label,
          trendPositive: carryTrend.positive
        },
        {
          title: 'Carry Distance',
          before: formatValue(comparisonClub.carryMedianChange.previous, 'y'),
          after: formatValue(comparisonClub.carryMedianChange.current, 'y'),
          trendLabel: distanceTrend.label,
          trendPositive: distanceTrend.positive
        }
      ];
    }

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
  }, [comparisonClub, series]);

  const streakLabel = overview ? `${overview.sessionsCount} Sessions` : '6 Sessions';
  const bestClub = useMemo(() => {
    const clubs = overview?.periodComparison?.clubs ?? [];
    if (!clubs.length) {
      return {
        title: 'Best Club',
        copy: `Your standout club for this ${activeRange.label.toLowerCase()} will show here.`
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
  }, [activeRange.label, overview?.periodComparison?.clubs]);
  const rangeSummary = useMemo(() => {
    const comparison = overview?.periodComparison;
    if (!comparison) {
      return {
        badge: 'Selected Range',
        value: streakLabel,
        copy: 'Your current range will compare against the previous matching window once enough data is available.'
      };
    }

    return {
      badge: `${activeRange.label} Sessions`,
      value: `${comparison.currentPeriod.sessions}`,
      copy: `Previous ${activeRange.label.toLowerCase()}: ${comparison.previousPeriod.sessions} session${comparison.previousPeriod.sessions === 1 ? '' : 's'}.`
    };
  }, [activeRange.label, overview?.periodComparison, streakLabel]);
  const navItems = buildPrimaryNav('Progress');

  return (
    <AppPageShell className="progress-overview-page">
      <AppHeaderBar title="Progress Overview" subtitle={activeRange.subtitle} className="progress-top-bar">
        <div className="time-window-row" role="group" aria-label="Progress overview ranges">
          {progressRangeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={selectedRange === option.value ? 'window-button active' : 'window-button'}
              onClick={() => setSelectedRange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </AppHeaderBar>

      {error ? <p className="helper-text">{error}</p> : null}
      {loading ? <p className="helper-text">Loading progress snapshot...</p> : null}

      <div className="progress-overview-stack">
        <section className="section">
          {metricCards.map((card) => (
            <ProgressCard key={card.title} card={card} />
          ))}
        </section>

        <AppCard className="progress-streak-card" bodyClassName="progress-streak-body">
          <div className="progress-streak-badge">{rangeSummary.badge}</div>
          <p className="progress-streak-value">{rangeSummary.value}</p>
          <p className="progress-streak-copy">
            {overview?.periodComparison
              ? rangeSummary.copy
              : overview?.trendDeltas?.summary ?? 'You are building real momentum. Keep stacking focused sessions.'}
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
