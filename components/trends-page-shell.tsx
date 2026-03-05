'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type ClubTrendRange = '7d' | '30d' | '90d' | '1y' | 'all';

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

type MetricKey = 'carryMedian' | 'offlineStdDev' | 'carryStdDev' | 'smashMedian' | 'faceToPathMean';

const rangeOptions: Array<{ value: ClubTrendRange; label: string }> = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: '1y', label: '1y' },
  { value: 'all', label: 'All' }
];

const metricConfig: Record<MetricKey, { label: string; suffix: string; description: string }> = {
  carryMedian: { label: 'Carry Median', suffix: ' yds', description: 'Typical carry distance. Higher is usually better.' },
  offlineStdDev: { label: 'Offline Std Dev', suffix: ' yds', description: 'Directional spread. Lower means tighter accuracy.' },
  carryStdDev: { label: 'Carry Std Dev', suffix: ' yds', description: 'Distance spread. Lower means tighter distance control.' },
  smashMedian: { label: 'Smash Median', suffix: '', description: 'Strike efficiency trend over sessions.' },
  faceToPathMean: { label: 'Face To Path Mean', suffix: ' deg', description: 'Face/path bias trend; closer to stock intent is better.' }
};

const formatMetric = (value: number | null, suffix: string) => {
  if (value === null) return '-';
  return `${value.toFixed(1)}${suffix}`;
};

const formatDelta = (value: number | null, suffix: string) => {
  if (value === null) return '-';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}${suffix}`;
};

const valueFor = (point: ClubTrendPoint, metric: MetricKey) => point[metric];

function TrendChartCard({
  title,
  metric,
  points
}: {
  title: string;
  metric: MetricKey;
  points: ClubTrendPoint[];
}) {
  const sortedAsc = useMemo(
    () => [...points].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [points]
  );
  const sortedDesc = useMemo(
    () => [...points].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [points]
  );

  const numericValues = sortedAsc
    .map((point) => valueFor(point, metric))
    .filter((value): value is number => typeof value === 'number');
  const min = numericValues.length ? Math.min(...numericValues) : null;
  const max = numericValues.length ? Math.max(...numericValues) : null;
  const span = min !== null && max !== null ? Math.max(1, max - min) : 1;
  const width = 520;
  const height = 180;
  const maxIndex = Math.max(1, sortedAsc.length - 1);

  const segments: string[] = [];
  let currentSegment: string[] = [];
  sortedAsc.forEach((point, index) => {
    const value = valueFor(point, metric);
    if (typeof value !== 'number' || min === null) {
      if (currentSegment.length > 1) segments.push(currentSegment.join(' '));
      currentSegment = [];
      return;
    }
    const x = (index / maxIndex) * width;
    const y = height - ((value - min) / span) * height;
    currentSegment.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  });
  if (currentSegment.length > 1) segments.push(currentSegment.join(' '));

  const circles = sortedAsc
    .map((point, index) => {
      const value = valueFor(point, metric);
      if (typeof value !== 'number' || min === null) return null;
      const x = (index / maxIndex) * width;
      const y = height - ((value - min) / span) * height;
      return { x, y, id: `${point.sessionId}-${metric}-${index}` };
    })
    .filter((point): point is NonNullable<typeof point> => point !== null);

  const latestTwo = sortedDesc
    .map((point) => valueFor(point, metric))
    .filter((value): value is number => typeof value === 'number')
    .slice(0, 2);
  const latest = latestTwo[0] ?? null;
  const delta = latestTwo.length > 1 ? latestTwo[0] - latestTwo[1] : null;

  return (
    <article className="viz-card">
      <div className="trend-card-header">
        <div>
          <h3>{title}</h3>
          <p>{metricConfig[metric].description}</p>
        </div>
        <p className="trend-card-meta">
          Last: <strong>{formatMetric(latest, metricConfig[metric].suffix)}</strong> | Delta:{' '}
          <strong>{formatDelta(delta, metricConfig[metric].suffix)}</strong>
        </p>
      </div>
      {circles.length === 0 ? (
        <p className="helper-text">No data for this metric in the selected range.</p>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} trend line`}>
          {segments.map((segment) => (
            <polyline key={segment} points={segment} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
          ))}
          {circles.map((point) => (
            <circle key={point.id} cx={point.x} cy={point.y} r={3} fill="var(--accent)" />
          ))}
        </svg>
      )}
    </article>
  );
}

export default function TrendsPageShell() {
  const searchParams = useSearchParams();
  const [clubs, setClubs] = useState<string[]>([]);
  const [selectedClub, setSelectedClub] = useState('');
  const [range, setRange] = useState<ClubTrendRange>('90d');
  const [series, setSeries] = useState<ClubTrendPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadClubs = async () => {
      setError(null);
      const response = await fetch('/api/sessions/trends/clubs', { cache: 'no-store' });
      if (!response.ok) {
        setError('Could not load clubs.');
        return;
      }
      const payload = (await response.json()) as { clubs: string[] };
      const fromQuery = searchParams.get('club')?.trim();
      setClubs(payload.clubs ?? []);
      setSelectedClub((current) => {
        if (current) return current;
        if (fromQuery && payload.clubs?.includes(fromQuery)) return fromQuery;
        return payload.clubs?.[0] || '';
      });
    };
    void loadClubs();
  }, [searchParams]);

  useEffect(() => {
    if (!selectedClub) {
      setSeries([]);
      return;
    }
    const controller = new AbortController();
    const loadSeries = async () => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ club: selectedClub, range });
      const response = await fetch(`/api/sessions/trends/club?${params.toString()}`, {
        cache: 'no-store',
        signal: controller.signal
      }).catch(() => null);
      if (!response || !response.ok) {
        if (!controller.signal.aborted) {
          setError('Could not load trend series.');
          setSeries([]);
          setLoading(false);
        }
        return;
      }
      const payload = (await response.json()) as { series: ClubTrendPoint[] };
      if (!controller.signal.aborted) {
        setSeries(payload.series ?? []);
        setLoading(false);
      }
    };
    void loadSeries();
    return () => controller.abort();
  }, [range, selectedClub]);

  const optionalMetric = useMemo<MetricKey | null>(() => {
    if (series.some((point) => typeof point.smashMedian === 'number')) return 'smashMedian';
    if (series.some((point) => typeof point.faceToPathMean === 'number')) return 'faceToPathMean';
    return null;
  }, [series]);

  const insights = useMemo(() => {
    if (!series.length) return [] as string[];
    const sortedAsc = [...series].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const insightsList: string[] = [];
    const visibleMetrics: MetricKey[] = ['carryMedian', 'offlineStdDev', 'carryStdDev'];
    if (optionalMetric) visibleMetrics.push(optionalMetric);

    const offlineTriples = sortedAsc
      .map((point) => point.offlineStdDev)
      .filter((value): value is number => typeof value === 'number');
    if (offlineTriples.length >= 3) {
      let bestWindowAvg = Number.POSITIVE_INFINITY;
      let bestWindowStart = -1;
      for (let i = 0; i <= offlineTriples.length - 3; i += 1) {
        const avg = (offlineTriples[i] + offlineTriples[i + 1] + offlineTriples[i + 2]) / 3;
        if (avg < bestWindowAvg) {
          bestWindowAvg = avg;
          bestWindowStart = i;
        }
      }
      if (bestWindowStart >= 0) {
        insightsList.push(
          `Best 3-session stretch (direction): avg offline std dev ${bestWindowAvg.toFixed(1)} yds over sessions ${bestWindowStart + 1}-${bestWindowStart + 3}.`
        );
      }
    }

    const improvements = visibleMetrics
      .map((metric) => {
        const values = sortedAsc.map((point) => point[metric]).filter((value): value is number => typeof value === 'number');
        if (values.length < 2) return null;
        const change = values[values.length - 1] - values[0];
        const reduction = -change;
        return { metric, reduction, start: values[0], end: values[values.length - 1] };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((a, b) => b.reduction - a.reduction);
    const mostImproved = improvements.find((item) => item.reduction > 0);
    if (mostImproved) {
      const config = metricConfig[mostImproved.metric];
      insightsList.push(
        `Most improved metric: ${config.label} reduced by ${mostImproved.reduction.toFixed(1)}${config.suffix} (${mostImproved.start.toFixed(1)} -> ${mostImproved.end.toFixed(1)}${config.suffix}).`
      );
    }

    const recentOffline = sortedAsc
      .map((point) => point.offlineStdDev)
      .filter((value): value is number => typeof value === 'number')
      .slice(-3);
    if (recentOffline.length === 3 && recentOffline[0] > 0) {
      const increasePct = ((recentOffline[2] - recentOffline[0]) / recentOffline[0]) * 100;
      if (increasePct >= 20) {
        insightsList.push(
          `Regression warning: Direction trending worse. Offline std dev increased ${increasePct.toFixed(1)}% over last 3 sessions (${recentOffline[0].toFixed(1)} -> ${recentOffline[2].toFixed(1)} yds).`
        );
      }
    }

    const latest = [...series].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    if (
      optionalMetric === 'faceToPathMean' &&
      latest &&
      typeof latest.faceToPathMean === 'number' &&
      latest.faceToPathMean > 0 &&
      latest.topMissShape === 'PushFade'
    ) {
      insightsList.push(
        `Pattern note: Face-to-path mean is positive (${latest.faceToPathMean.toFixed(1)} deg) and dominant miss is PushFade in the latest session.`
      );
    }

    return insightsList;
  }, [optionalMetric, series]);

  return (
    <section className="stack">
      <section className="auth-panel">
        <div className="trends-controls">
          <label>
            Club
            <select value={selectedClub} onChange={(event) => setSelectedClub(event.target.value)}>
              {clubs.length === 0 && <option value="">No clubs found</option>}
              {clubs.map((club) => (
                <option key={club} value={club}>
                  {club}
                </option>
              ))}
            </select>
          </label>
          <label>
            Range
            <select value={range} onChange={(event) => setRange(event.target.value as ClubTrendRange)}>
              {rangeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <details className="term-key">
          <summary>How To Read These Trends</summary>
          <ul>
            <li>
              <strong>Each point</strong> is one saved session for the selected club.
            </li>
            <li>
              <strong>Last</strong> is the most recent session value in this range.
            </li>
            <li>
              <strong>Delta</strong> is Last minus the previous session value.
            </li>
            <li>
              <strong>Gaps</strong> in lines mean that metric was unavailable for that session.
            </li>
            <li>
              <strong>Carry Median:</strong> typical carry distance for the club.
            </li>
            <li>
              <strong>Offline Std Dev:</strong> directional consistency; lower is tighter.
            </li>
            <li>
              <strong>Carry Std Dev:</strong> distance consistency; lower is tighter.
            </li>
            <li>
              <strong>Smash Median:</strong> strike efficiency trend (if data exists).
            </li>
            <li>
              <strong>Face To Path Mean:</strong> face/path relationship bias trend (if data exists).
            </li>
          </ul>
        </details>
        {loading && <p className="helper-text">Loading trend charts...</p>}
        {error && <p className="error">{error}</p>}
        {!loading && !error && selectedClub && series.length === 0 && (
          <p className="helper-text">No sessions found for this club in the selected range.</p>
        )}
      </section>

      {!error && series.length > 0 && (
        <section className="viz-grid">
          <article className="viz-card large">
            <h3>Insights (Deterministic)</h3>
            {insights.length === 0 ? (
              <p className="helper-text">No deterministic insights triggered for the selected club and range.</p>
            ) : (
              <ul className="insights-list">
                {insights.map((insight) => (
                  <li key={insight}>{insight}</li>
                ))}
              </ul>
            )}
          </article>
          <TrendChartCard title={metricConfig.carryMedian.label} metric="carryMedian" points={series} />
          <TrendChartCard title={metricConfig.offlineStdDev.label} metric="offlineStdDev" points={series} />
          <TrendChartCard title={metricConfig.carryStdDev.label} metric="carryStdDev" points={series} />
          {optionalMetric && (
            <TrendChartCard title={metricConfig[optionalMetric].label} metric={optionalMetric} points={series} />
          )}
        </section>
      )}
    </section>
  );
}
