'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  computeMissPatterns,
  toNormalizedShotsFromShotRecords,
  type CoachPlan,
  type GappingLadder,
  type SessionSummary,
  type Shape,
  type ShotRecord
} from '@/lib/r10';
import { computeCoachDiagnosis, type CoachDiagnosis, type ConstraintType } from '@/lib/coach-diagnosis';
import { generateDeterministicPlan } from '@/lib/drill-library';
import type { RuleInsight, TrendDeltas } from '@/types/analysis';
import type { CoachV2Plan } from '@/types/coach';

type SessionListItem = {
  id: string;
  sourceFile: string | null;
  sessionDate: string;
  importedAt: string;
  shots: number;
  avgCarryYds: number | null;
  avgBallSpeedMph: number | null;
  clubs: number;
};

type SessionDetail = {
  id: string;
  sourceFile: string | null;
  sessionDate: string;
  importedAt: string;
  shots: ShotRecord[];
  summary: SessionSummary;
  gappingLadder: GappingLadder;
  coachPlan: CoachPlan | null;
  coachV2Plan: CoachV2Plan | null;
  trendDeltas: TrendDeltas | null;
  ruleInsights: RuleInsight[];
};

type AllTimePayload = {
  sessionsCount: number;
  summary: SessionSummary;
  gappingLadder: GappingLadder;
  coachPlan: CoachPlan | null;
  coachV2Plan: CoachV2Plan | null;
  trendDeltas: TrendDeltas | null;
  ruleInsights: RuleInsight[];
};

type CoachProfile = {
  tone: 'straight' | 'encouraging' | 'technical';
  detailLevel: 'concise' | 'balanced' | 'deep';
  updatedAt: string | null;
};

type SessionHistoryProps = {
  refreshKey: number;
};

type TimeWindow = 'all' | '1w' | '1m' | '3m' | '9m' | '1y';
type InsightView = 'coach' | 'gapping' | 'deepdive';

const timeWindowOptions: Array<{ value: TimeWindow; label: string }> = [
  { value: 'all', label: 'All Time' },
  { value: '1w', label: '1 Week' },
  { value: '1m', label: '1 Month' },
  { value: '3m', label: '3 Months' },
  { value: '9m', label: '9 Months' },
  { value: '1y', label: '1 Year' }
];

const formatNumber = (value: number | null, suffix = '') =>
  value === null ? '-' : `${value.toFixed(1)}${suffix}`;
const formatRange = (low: number | null, high: number | null, suffix = '') => {
  if (low === null || high === null) return '-';
  return `${low.toFixed(1)}${suffix} - ${high.toFixed(1)}${suffix}`;
};
const formatGapStatus = (status: GappingLadder['rows'][number]['gapStatus']) => {
  if (!status) return '-';
  if (status === 'healthy') return 'Healthy';
  if (status === 'compressed') return 'Compressed';
  if (status === 'overlap') return 'Overlap';
  return 'Cliff';
};
const formatDateTime = (value: string) => new Date(value).toLocaleString();
const formatTrendDelta = (delta: number | null, unit: string) => {
  if (delta === null) return '-';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)} ${unit}`;
};
const formatValue = (value: number | null, suffix = '') => (value === null ? '-' : `${value.toFixed(1)}${suffix}`);
const formatBreakdownTerms = (terms: Record<string, number | null>) =>
  Object.entries(terms)
    .map(([key, value]) => `${key}=${typeof value === 'number' ? value.toFixed(2) : 'n/a'}`)
    .join(', ') || 'n/a';

const resolveKeyMetricLabel = (constraintLabel: string) => {
  const normalized = constraintLabel.toLowerCase();
  if (normalized.includes('direction')) return 'Offline std dev';
  if (normalized.includes('face')) return 'Face-to-path std dev';
  if (normalized.includes('distance')) return 'Carry std dev';
  if (normalized.includes('strike')) return 'Smash std dev';
  if (normalized.includes('gapping')) return 'Gap alerts';
  return 'Primary metric';
};

const mapCoachKeyToConstraintType = (key: string): ConstraintType => {
  if (key === 'direction_consistency') return 'DirectionConsistency';
  if (key === 'distance_control') return 'DistanceControl';
  if (key === 'strike_quality') return 'StrikeQuality';
  if (key === 'bag_gapping') return 'DistanceControl';
  return 'DistanceControl';
};

type MetricKey =
  | 'carryYds'
  | 'totalYds'
  | 'ballSpeedMph'
  | 'clubSpeedMph'
  | 'launchAngleDeg'
  | 'spinRpm'
  | 'sideYds'
  | 'clubPathDeg'
  | 'faceToPathDeg'
  | 'faceAngleDeg'
  | 'attackAngleDeg'
  | 'launchDirectionDeg'
  | 'spinAxisDeg'
  | 'backspinRpm'
  | 'sidespinRpm'
  | 'smashFactor'
  | 'apexFt';

const metricConfig: Record<MetricKey, { label: string; suffix: string; read: (shot: ShotRecord) => number | null }> = {
  carryYds: { label: 'Carry', suffix: ' yds', read: (shot) => shot.carryYds },
  totalYds: { label: 'Total', suffix: ' yds', read: (shot) => shot.totalYds },
  ballSpeedMph: { label: 'Ball Speed', suffix: ' mph', read: (shot) => shot.ballSpeedMph },
  clubSpeedMph: { label: 'Club Speed', suffix: ' mph', read: (shot) => shot.clubSpeedMph },
  launchAngleDeg: { label: 'Launch', suffix: ' deg', read: (shot) => shot.launchAngleDeg },
  spinRpm: { label: 'Spin', suffix: ' rpm', read: (shot) => shot.spinRpm },
  sideYds: { label: 'Side', suffix: ' yds', read: (shot) => shot.sideYds },
  clubPathDeg: { label: 'Club Path', suffix: ' deg', read: (shot) => shot.clubPathDeg },
  faceToPathDeg: { label: 'Face To Path', suffix: ' deg', read: (shot) => shot.faceToPathDeg },
  faceAngleDeg: { label: 'Club Face', suffix: ' deg', read: (shot) => shot.faceAngleDeg },
  attackAngleDeg: { label: 'Attack Angle', suffix: ' deg', read: (shot) => shot.attackAngleDeg },
  launchDirectionDeg: { label: 'Launch Direction', suffix: ' deg', read: (shot) => shot.launchDirectionDeg },
  spinAxisDeg: { label: 'Spin Axis', suffix: ' deg', read: (shot) => shot.spinAxisDeg },
  backspinRpm: { label: 'Backspin', suffix: ' rpm', read: (shot) => shot.backspinRpm },
  sidespinRpm: { label: 'Sidespin', suffix: ' rpm', read: (shot) => shot.sidespinRpm },
  smashFactor: { label: 'Smash Factor', suffix: '', read: (shot) => shot.smashFactor },
  apexFt: { label: 'Apex', suffix: ' ft', read: (shot) => shot.apexFt }
};

const metricKeys = Object.keys(metricConfig) as MetricKey[];

const minMax = (values: Array<number | null>) => {
  const numbers = values.filter((value): value is number => typeof value === 'number');
  if (!numbers.length) return { min: null, max: null };
  return { min: Math.min(...numbers), max: Math.max(...numbers) };
};

const buildLinePoints = (values: Array<number | null>, width = 520, height = 160) => {
  const valid = values
    .map((value, index) => ({ value, index }))
    .filter((entry): entry is { value: number; index: number } => typeof entry.value === 'number');
  if (valid.length < 2) return null;

  const valueRange = valid.reduce(
    (acc, entry) => ({
      min: Math.min(acc.min, entry.value),
      max: Math.max(acc.max, entry.value)
    }),
    { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY }
  );
  const span = Math.max(1, valueRange.max - valueRange.min);
  const maxIndex = Math.max(1, values.length - 1);

  return valid
    .map((entry) => {
      const x = (entry.index / maxIndex) * width;
      const y = height - ((entry.value - valueRange.min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
};

const buildScatterPoints = (
  shots: ShotRecord[],
  xMetric: MetricKey,
  yMetric: MetricKey,
  width = 520,
  height = 220
): Array<{ x: number; y: number; isOutlier: boolean }> => {
  const valid = shots.filter(
    (shot): shot is ShotRecord =>
      typeof metricConfig[xMetric].read(shot) === 'number' && typeof metricConfig[yMetric].read(shot) === 'number'
  );
  if (!valid.length) return [];

  const xValues = valid.map((shot) => metricConfig[xMetric].read(shot) as number);
  const yValues = valid.map((shot) => metricConfig[yMetric].read(shot) as number);
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);
  const xSpan = Math.max(1, xMax - xMin);
  const ySpan = Math.max(1, yMax - yMin);

  return valid.map((shot) => ({
    x: (((metricConfig[xMetric].read(shot) as number) - xMin) / xSpan) * width,
    y: height - (((metricConfig[yMetric].read(shot) as number) - yMin) / ySpan) * height,
    isOutlier: shot.isOutlier
  }));
};

type CollapsibleSectionProps = {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
};

function CollapsibleSection({ title, isOpen, onToggle, children, className }: CollapsibleSectionProps) {
  return (
    <section className={`auth-panel ${className ?? ''}`.trim()}>
      <div className="section-header">
        <h3>{title}</h3>
        <button type="button" onClick={onToggle}>
          {isOpen ? 'Hide' : 'Show'}
        </button>
      </div>
      {isOpen && children}
    </section>
  );
}

export default function SessionHistory({ refreshKey }: SessionHistoryProps) {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [allTime, setAllTime] = useState<AllTimePayload | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coachProfile, setCoachProfile] = useState<CoachProfile | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null);
  const [coachSummary, setCoachSummary] = useState<{
    text: string;
    source: string;
    model: string | null;
    whyThisHappens: string;
    whatToDoNext: string;
    onCourseTip: string;
  } | null>(null);
  const [summaryStatus, setSummaryStatus] = useState<string | null>(null);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('all');
  const [showAllTime, setShowAllTime] = useState(true);
  const [showSavedSessions, setShowSavedSessions] = useState(true);
  const [showSessionDetail, setShowSessionDetail] = useState(true);
  const [allTimeView, setAllTimeView] = useState<InsightView>('coach');
  const [sessionView, setSessionView] = useState<InsightView>('coach');
  const [fullDataClubFilter, setFullDataClubFilter] = useState<'all' | string>('all');
  const [visibleMetrics, setVisibleMetrics] = useState<MetricKey[]>([
    'carryYds',
    'totalYds',
    'ballSpeedMph',
    'clubSpeedMph',
    'launchAngleDeg',
    'spinRpm',
    'sideYds',
    'clubPathDeg',
    'faceToPathDeg',
    'faceAngleDeg',
    'attackAngleDeg',
    'launchDirectionDeg',
    'spinAxisDeg',
    'backspinRpm',
    'sidespinRpm',
    'smashFactor',
    'apexFt'
  ]);
  const [trendMetric, setTrendMetric] = useState<MetricKey>('carryYds');
  const [scatterXMetric, setScatterXMetric] = useState<MetricKey>('sideYds');
  const [scatterYMetric, setScatterYMetric] = useState<MetricKey>('carryYds');
  const [expandedViz, setExpandedViz] = useState<'trend' | 'scatter' | null>(null);
  const [shotSortMetric, setShotSortMetric] = useState<'shotIndex' | 'club' | 'outlier' | MetricKey>('shotIndex');
  const [shotSortDirection, setShotSortDirection] = useState<'asc' | 'desc'>('asc');
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [localRefreshKey, setLocalRefreshKey] = useState(0);

  const availableSessionClubs = useMemo(() => {
    if (!selectedSession) return [];
    return Array.from(new Set(selectedSession.shots.map((shot) => shot.displayClub))).sort((a, b) => a.localeCompare(b));
  }, [selectedSession]);

  const fullDataShots = useMemo(() => {
    if (!selectedSession) return [];
    if (fullDataClubFilter === 'all') return selectedSession.shots;
    return selectedSession.shots.filter((shot) => shot.displayClub === fullDataClubFilter);
  }, [fullDataClubFilter, selectedSession]);

  const sortedFullDataShots = useMemo(() => {
    const withIndex = fullDataShots.map((shot, index) => ({ shot, index }));

    const compareNullable = (left: number | null, right: number | null) => {
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      return left - right;
    };

    withIndex.sort((a, b) => {
      let value = 0;
      if (shotSortMetric === 'shotIndex') {
        value = a.index - b.index;
      } else if (shotSortMetric === 'club') {
        value = a.shot.displayClub.localeCompare(b.shot.displayClub);
      } else if (shotSortMetric === 'outlier') {
        value = Number(a.shot.isOutlier) - Number(b.shot.isOutlier);
      } else {
        value = compareNullable(metricConfig[shotSortMetric].read(a.shot), metricConfig[shotSortMetric].read(b.shot));
      }
      return shotSortDirection === 'asc' ? value : -value;
    });

    return withIndex;
  }, [fullDataShots, shotSortDirection, shotSortMetric]);

  const fullDataRanges = useMemo(() => {
    return visibleMetrics.reduce(
      (acc, key) => {
        acc[key] = minMax(fullDataShots.map((shot) => metricConfig[key].read(shot)));
        return acc;
      },
      {} as Record<MetricKey, { min: number | null; max: number | null }>
    );
  }, [fullDataShots, visibleMetrics]);

  const trendPoints = useMemo(
    () => buildLinePoints(fullDataShots.map((shot) => metricConfig[trendMetric].read(shot))),
    [fullDataShots, trendMetric]
  );
  const dispersionPoints = useMemo(
    () => buildScatterPoints(fullDataShots, scatterXMetric, scatterYMetric),
    [fullDataShots, scatterXMetric, scatterYMetric]
  );
  const selectedSessionMissPatterns = useMemo(
    () => (selectedSession ? computeMissPatterns(toNormalizedShotsFromShotRecords(selectedSession.shots)) : null),
    [selectedSession]
  );
  const selectedSessionDiagnosis = useMemo(
    () => (selectedSession ? computeCoachDiagnosis(toNormalizedShotsFromShotRecords(selectedSession.shots)) : null),
    [selectedSession]
  );
  const selectedSessionTopThreeShapes = useMemo(() => {
    if (!selectedSessionMissPatterns) return [];
    return Object.entries(selectedSessionMissPatterns.overall.distribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3) as Array<[Shape, number]>;
  }, [selectedSessionMissPatterns]);
  const selectedPrimaryMetricLabel = useMemo(() => {
    if (!selectedSessionDiagnosis) return null;
    const primary = selectedSessionDiagnosis.primary;
    if (primary.constraintType === 'DirectionConsistency') return 'offlineStdDev';
    if (primary.constraintType === 'FaceControl') return 'faceToPathStdDev';
    if (primary.constraintType === 'DistanceControl') return 'carryStdDev';
    return 'smashStdDev';
  }, [selectedSessionDiagnosis]);
  const selectedPrimaryMetricValue =
    selectedSessionDiagnosis && selectedPrimaryMetricLabel
      ? selectedSessionDiagnosis.primary.keyMetrics[selectedPrimaryMetricLabel] ?? null
      : null;
  const allTimePrimaryIssue = allTime?.coachV2Plan?.primaryConstraint.label ?? 'Unavailable';
  const allTimePrimaryClub = allTime?.coachV2Plan?.primaryConstraint.focusClub ?? 'Session';
  const allTimePrimaryMetricLabel = allTime?.coachV2Plan
    ? allTime.coachV2Plan.primaryConstraint.targetMetric || resolveKeyMetricLabel(allTime.coachV2Plan.primaryConstraint.label)
    : 'Primary metric';
  const allTimePrimaryMetricValue = allTime?.coachV2Plan?.primaryConstraint.currentValue ?? null;
  const allTimePrimaryTarget = allTime?.coachV2Plan?.practicePlan.goal ?? 'Build baseline consistency over next 3 sessions.';
  const sessionPrimaryIssue = selectedSessionDiagnosis?.primary.constraintType ?? selectedSession?.coachV2Plan?.primaryConstraint.label ?? 'Unavailable';
  const sessionPrimaryClub = selectedSessionDiagnosis?.primary.club ?? selectedSession?.coachV2Plan?.primaryConstraint.focusClub ?? 'Session';
  const sessionPrimaryMetricLabel =
    selectedPrimaryMetricLabel ??
    (selectedSession?.coachV2Plan
      ? selectedSession.coachV2Plan.primaryConstraint.targetMetric ||
        resolveKeyMetricLabel(selectedSession.coachV2Plan.primaryConstraint.label)
      : 'Primary metric');
  const sessionPrimaryMetricValue =
    selectedPrimaryMetricValue ?? selectedSession?.coachV2Plan?.primaryConstraint.currentValue ?? null;
  const sessionPrimaryTarget =
    selectedSession?.coachV2Plan?.practicePlan.goal ?? 'Reduce this metric by 15-20% over the next 3 sessions.';
  const allTimeDiagnosis = useMemo<CoachDiagnosis | null>(() => {
    if (!allTime?.coachV2Plan) return null;
    const primary = allTime.coachV2Plan.primaryConstraint;
    return {
      primary: {
        constraintType: mapCoachKeyToConstraintType(primary.key),
        club: primary.focusClub ?? 'Session',
        severityScore: primary.score,
        confidence: allTime.coachV2Plan.confidence.shotsAnalyzed >= 25 ? 'High' : allTime.coachV2Plan.confidence.shotsAnalyzed >= 12 ? 'Medium' : 'Low',
        keyMetrics: {
          currentValue: primary.currentValue ?? null,
          targetValue: primary.targetValue ?? null
        },
        scoreBreakdown: {
          formula: primary.targetMetric,
          terms: {
            currentValue: primary.currentValue ?? null,
            targetValue: primary.targetValue ?? null
          }
        }
      },
      secondary: allTime.coachV2Plan.secondaryConstraint
        ? {
            constraintType: mapCoachKeyToConstraintType(allTime.coachV2Plan.secondaryConstraint.key),
            club: allTime.coachV2Plan.secondaryConstraint.focusClub ?? 'Session',
            severityScore: allTime.coachV2Plan.secondaryConstraint.score,
            confidence:
              allTime.coachV2Plan.confidence.shotsAnalyzed >= 25
                ? 'High'
                : allTime.coachV2Plan.confidence.shotsAnalyzed >= 12
                  ? 'Medium'
                  : 'Low',
            keyMetrics: {
              currentValue: allTime.coachV2Plan.secondaryConstraint.currentValue ?? null,
              targetValue: allTime.coachV2Plan.secondaryConstraint.targetValue ?? null
            },
            scoreBreakdown: {
              formula: allTime.coachV2Plan.secondaryConstraint.targetMetric,
              terms: {
                currentValue: allTime.coachV2Plan.secondaryConstraint.currentValue ?? null,
                targetValue: allTime.coachV2Plan.secondaryConstraint.targetValue ?? null
              }
            }
          }
        : undefined,
      sessionHighlights: {}
    };
  }, [allTime]);
  const allTimePlan20 = useMemo(
    () => (allTimeDiagnosis ? generateDeterministicPlan(allTimeDiagnosis, 20) : null),
    [allTimeDiagnosis]
  );
  const allTimePlan40 = useMemo(
    () => (allTimeDiagnosis ? generateDeterministicPlan(allTimeDiagnosis, 40) : null),
    [allTimeDiagnosis]
  );
  const selectedSessionPlan20 = useMemo(
    () => (selectedSessionDiagnosis ? generateDeterministicPlan(selectedSessionDiagnosis, 20) : null),
    [selectedSessionDiagnosis]
  );
  const selectedSessionPlan40 = useMemo(
    () => (selectedSessionDiagnosis ? generateDeterministicPlan(selectedSessionDiagnosis, 40) : null),
    [selectedSessionDiagnosis]
  );

  useEffect(() => {
    const load = async () => {
      setError(null);
      const [sessionsResponse, allTimeResponse, profileResponse] = await Promise.all([
        fetch('/api/sessions', { cache: 'no-store' }),
        fetch(`/api/sessions/all-time?window=${timeWindow}`, { cache: 'no-store' }),
        fetch('/api/coach/profile', { cache: 'no-store' })
      ]);

      if (!sessionsResponse.ok || !allTimeResponse.ok || !profileResponse.ok) {
        setError('Could not load session history.');
        return;
      }

      const sessionsPayload = (await sessionsResponse.json()) as { sessions: SessionListItem[] };
      const allTimePayload = (await allTimeResponse.json()) as AllTimePayload;
      const profilePayload = (await profileResponse.json()) as { profile: CoachProfile };
      setSessions(sessionsPayload.sessions);
      setAllTime(allTimePayload);
      setCoachProfile(profilePayload.profile);
      if (!sessionsPayload.sessions.length) {
        setSelectedSession(null);
      }
    };

    void load();
  }, [refreshKey, timeWindow, localRefreshKey]);

  useEffect(() => {
    if (!visibleMetrics.includes(trendMetric)) {
      setTrendMetric(visibleMetrics[0]);
    }
    if (!visibleMetrics.includes(scatterXMetric)) {
      setScatterXMetric(visibleMetrics[0]);
    }
    if (!visibleMetrics.includes(scatterYMetric)) {
      setScatterYMetric(visibleMetrics[0]);
    }
  }, [visibleMetrics, trendMetric, scatterXMetric, scatterYMetric]);

  const loadSession = async (sessionId: string) => {
    setLoadingSessionId(sessionId);
    setError(null);
    const response = await fetch(`/api/sessions/${sessionId}`, { cache: 'no-store' });
    if (!response.ok) {
      setLoadingSessionId(null);
      setError('Could not load selected session.');
      return;
    }
    const payload = (await response.json()) as SessionDetail;
    setSelectedSession(payload);
    setShowSessionDetail(true);
    setSessionView('coach');
    setFullDataClubFilter('all');
    setVisibleMetrics([
      'carryYds',
      'totalYds',
      'ballSpeedMph',
      'clubSpeedMph',
      'launchAngleDeg',
      'spinRpm',
      'sideYds',
      'clubPathDeg',
      'faceToPathDeg',
      'faceAngleDeg',
      'attackAngleDeg',
      'launchDirectionDeg',
      'spinAxisDeg',
      'backspinRpm',
      'sidespinRpm',
      'smashFactor',
      'apexFt'
    ]);
    setTrendMetric('carryYds');
    setScatterXMetric('sideYds');
    setScatterYMetric('carryYds');
    setExpandedViz(null);
    setShotSortMetric('shotIndex');
    setShotSortDirection('asc');
    setLoadingSessionId(null);
  };

  const deleteSession = async (sessionId: string) => {
    const confirmed = window.confirm('Delete this range session from history?');
    if (!confirmed) return;

    setDeletingSessionId(sessionId);
    setError(null);
    const response = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
    if (!response.ok) {
      setDeletingSessionId(null);
      setError('Could not delete session.');
      return;
    }

    if (selectedSession?.id === sessionId) {
      setSelectedSession(null);
    }
    setDeletingSessionId(null);
    setLocalRefreshKey((value) => value + 1);
  };

  const saveProfile = async () => {
    if (!coachProfile) return;
    setSavingProfile(true);
    setError(null);
    const response = await fetch('/api/coach/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tone: coachProfile.tone,
        detailLevel: coachProfile.detailLevel
      })
    });
    if (!response.ok) {
      setSavingProfile(false);
      setError('Could not save coach profile.');
      return;
    }
    const payload = (await response.json()) as { profile: CoachProfile };
    setCoachProfile(payload.profile);
    setSavingProfile(false);
  };

  const snapshotAnalysis = async () => {
    if (!selectedSession) return;
    setAnalysisStatus(null);
    const response = await fetch(`/api/coach/analysis/${selectedSession.id}`, {
      method: 'POST'
    });
    if (!response.ok) {
      setAnalysisStatus('Could not snapshot analysis.');
      return;
    }
    setAnalysisStatus('Analysis snapshot saved.');
  };

  const generateSummary = async () => {
    if (!selectedSession || !selectedSessionDiagnosis || !selectedSessionMissPatterns) return;
    setSummaryStatus('Generating summary...');
    setCoachSummary(null);
    const userTone = coachProfile?.tone === 'straight' ? 'direct' : coachProfile?.tone ?? 'encouraging';
    const response = await fetch('/api/coach/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        diagnosis: selectedSessionDiagnosis,
        missPattern: selectedSessionMissPatterns.overall,
        userTone
      })
    });
    if (!response.ok) {
      setSummaryStatus('Could not generate summary.');
      return;
    }
    const payload = (await response.json()) as {
      summary: string;
      source: string;
      model: string | null;
      whyThisHappens: string;
      whatToDoNext: string;
      onCourseTip: string;
    };
    setCoachSummary({
      text: payload.summary,
      source: payload.source,
      model: payload.model,
      whyThisHappens: payload.whyThisHappens,
      whatToDoNext: payload.whatToDoNext,
      onCourseTip: payload.onCourseTip
    });
    setSummaryStatus(null);
  };

  return (
    <section className="stack" aria-label="Saved sessions">
      <h2>Session Insights</h2>
      {error && <p className="error">{error}</p>}

      {allTime && (
        <CollapsibleSection
          title="All-Time Performance"
          isOpen={showAllTime}
          onToggle={() => setShowAllTime((value) => !value)}
        >
          <div className="time-window-row" role="group" aria-label="All-time filter windows">
            {timeWindowOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={timeWindow === option.value ? 'window-button active' : 'window-button'}
                onClick={() => setTimeWindow(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="flow-tabs sticky-flow-tabs" role="tablist" aria-label="All-time insight tabs">
            <button
              type="button"
              className={allTimeView === 'coach' ? 'flow-tab active' : 'flow-tab'}
              onClick={() => setAllTimeView('coach')}
            >
              Coach
            </button>
            <button
              type="button"
              className={allTimeView === 'gapping' ? 'flow-tab active' : 'flow-tab'}
              onClick={() => setAllTimeView('gapping')}
            >
              Gapping Ladder
            </button>
            <button
              type="button"
              className={allTimeView === 'deepdive' ? 'flow-tab active' : 'flow-tab'}
              onClick={() => setAllTimeView('deepdive')}
            >
              Deep Dive
            </button>
          </div>
          <section className="summary-grid" aria-label="All-time issue summary">
            <article>
              <h3>Primary Issue</h3>
              <p>{allTimePrimaryIssue}</p>
            </article>
            <article>
              <h3>Club</h3>
              <p>{allTimePrimaryClub}</p>
            </article>
            <article>
              <h3>Key Metric</h3>
              <p>
                {allTimePrimaryMetricLabel}:{' '}
                {typeof allTimePrimaryMetricValue === 'number' ? allTimePrimaryMetricValue.toFixed(1) : '-'}
              </p>
            </article>
            <article>
              <h3>Target</h3>
              <p>{allTimePrimaryTarget}</p>
            </article>
          </section>
          {allTimeView === 'coach' && (
            <>
          {coachProfile && (
            <>
              <h3>Coach Preferences</h3>
              <p className="helper-text">
                Tune deterministic and future AI coaching delivery. Last updated:{' '}
                {coachProfile.updatedAt ? formatDateTime(coachProfile.updatedAt) : 'Never'}
              </p>
              <div className="summary-grid">
                <article>
                  <h3>Tone</h3>
                  <select
                    value={coachProfile.tone}
                    onChange={(event) =>
                      setCoachProfile((current) =>
                        current ? { ...current, tone: event.target.value as CoachProfile['tone'] } : current
                      )
                    }
                  >
                    <option value="encouraging">Encouraging</option>
                    <option value="straight">Straight</option>
                    <option value="technical">Technical</option>
                  </select>
                </article>
                <article>
                  <h3>Detail</h3>
                  <select
                    value={coachProfile.detailLevel}
                    onChange={(event) =>
                      setCoachProfile((current) =>
                        current ? { ...current, detailLevel: event.target.value as CoachProfile['detailLevel'] } : current
                      )
                    }
                  >
                    <option value="concise">Concise</option>
                    <option value="balanced">Balanced</option>
                    <option value="deep">Deep</option>
                  </select>
                </article>
                <article>
                  <h3>Save</h3>
                  <button type="button" onClick={() => void saveProfile()} disabled={savingProfile}>
                    {savingProfile ? 'Saving...' : 'Save Coach Profile'}
                  </button>
                </article>
              </div>
            </>
          )}
          <section className="summary-grid" aria-label="All-time summary">
            <article>
              <h3>Sessions</h3>
              <p>{allTime.sessionsCount}</p>
            </article>
            <article>
              <h3>Shots</h3>
              <p>{allTime.summary.shots}</p>
            </article>
            <article>
              <h3>Avg Carry</h3>
              <p>{formatNumber(allTime.summary.avgCarryYds, ' yds')}</p>
            </article>
            <article>
              <h3>Avg Ball Speed</h3>
              <p>{formatNumber(allTime.summary.avgBallSpeedMph, ' mph')}</p>
            </article>
            <article>
              <h3>Avg Spin</h3>
              <p>{formatNumber(allTime.summary.avgSpinRpm, ' rpm')}</p>
            </article>
            <article>
              <h3>Gap Alerts</h3>
              <p>
                {
                  allTime.gappingLadder.rows.filter(
                    (row) => row.gapStatus === 'overlap' || row.gapStatus === 'cliff'
                  ).length
                }
              </p>
            </article>
          </section>
            </>
          )}

          {allTimeView === 'gapping' && (
            <>
          <h3>Gapping Ladder</h3>
          <details className="term-key">
            <summary>Gapping Ladder Key</summary>
            <ul>
              <li>
                <strong>Median Carry:</strong> Your middle carry value for that club.
              </li>
              <li>
                <strong>P10-P90 Carry:</strong> Your typical carry band, from the 10th to 90th percentile.
              </li>
              <li>
                <strong>Gap To Next:</strong> Distance difference to the next shorter club.
              </li>
              <li>
                <strong>Healthy:</strong> Gap is in a normal playable range.
              </li>
              <li>
                <strong>Compressed:</strong> Gap is smaller than ideal, clubs may overlap in distance.
              </li>
              <li>
                <strong>Overlap:</strong> Gap is very small and club distances likely blend together.
              </li>
              <li>
                <strong>Cliff:</strong> Gap is too large, leaving an unusable distance hole.
              </li>
            </ul>
          </details>
          {allTime.gappingLadder.insights.length > 0 && (
            <ul className="insights-list">
              {allTime.gappingLadder.insights.map((insight) => (
                <li key={insight.message} className={`insight insight-${insight.severity}`}>
                  {insight.message}
                </li>
              ))}
            </ul>
          )}
          {allTime.gappingLadder.rows.length === 0 ? (
            <p className="helper-text">No gapping ladder rows in saved history yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Club</th>
                  <th>Median Carry</th>
                  <th>P10-P90 Carry</th>
                  <th>Gap To Next</th>
                  <th>Status</th>
                  <th>Warning</th>
                </tr>
              </thead>
              <tbody>
                {allTime.gappingLadder.rows.map((row) => (
                  <tr key={row.club}>
                    <td data-label="Club">{row.displayClub}</td>
                    <td data-label="Median Carry">{formatNumber(row.medianCarryYds, ' yds')}</td>
                    <td data-label="P10-P90 Carry">{formatRange(row.p10CarryYds, row.p90CarryYds, ' yds')}</td>
                    <td data-label="Gap To Next">{formatNumber(row.gapToNextYds, ' yds')}</td>
                    <td data-label="Status">
                      <span className={`gap-badge ${row.gapStatus ? `gap-${row.gapStatus}` : 'gap-none'}`}>
                        {formatGapStatus(row.gapStatus)}
                      </span>
                    </td>
                    <td data-label="Warning">{row.warning ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
            </>
          )}

          {allTimeView === 'deepdive' && (
            <>
          <h3>By Club</h3>
          {allTime.summary.clubs.length === 0 ? (
            <p className="helper-text">No club stats in saved history yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Club</th>
                  <th>Shots</th>
                  <th>Median Carry</th>
                  <th>P10-P90 Carry</th>
                  <th>Carry Std Dev</th>
                  <th>Offline Std Dev</th>
                  <th>Avg Carry</th>
                </tr>
              </thead>
              <tbody>
                {allTime.summary.clubs.map((club) => (
                  <tr key={club.name}>
                    <td data-label="Club">{club.displayName}</td>
                    <td data-label="Shots">{club.shots}</td>
                    <td data-label="Median Carry">{formatNumber(club.medianCarryYds, ' yds')}</td>
                    <td data-label="P10-P90 Carry">{formatRange(club.p10CarryYds, club.p90CarryYds, ' yds')}</td>
                    <td data-label="Carry Std Dev">{formatNumber(club.carryStdDevYds, ' yds')}</td>
                    <td data-label="Offline Std Dev">{formatNumber(club.offlineStdDevYds, ' yds')}</td>
                    <td data-label="Avg Carry">{formatNumber(club.avgCarryYds, ' yds')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
            </>
          )}

          {allTimeView === 'coach' && (
            <>
          {allTime.coachV2Plan && (
            <p>
              <strong>Current primary limiter:</strong> {allTime.coachV2Plan.primaryConstraint.label} (confidence{' '}
              {allTime.coachV2Plan.confidence.level}, {allTime.coachV2Plan.confidence.score}/100)
            </p>
          )}
          {allTimePlan20 && (
            <section className="coach-card" aria-label="All-time plan">
              <h3>Today&apos;s Plan (20 min)</h3>
              <p>
                <strong>Target:</strong> {allTimePlan20.targetText}
              </p>
              <p>
                <strong>Warmup ({allTimePlan20.warmup.durationMin} min):</strong> {allTimePlan20.warmup.name} -{' '}
                {allTimePlan20.warmup.repsText}
              </p>
              <p>
                <strong>How:</strong> {allTimePlan20.warmup.setupText}
              </p>
              <p>
                <strong>Why:</strong> {allTimePlan20.warmup.explanation}
              </p>
              <ul>
                {allTimePlan20.drills.map((drill) => (
                  <li key={drill.id}>
                    <strong>{drill.name}</strong> ({drill.durationMin} min)
                    <br />
                    <strong>How:</strong> {drill.setupText}
                    <br />
                    <strong>Reps:</strong> {drill.repsText}
                    <br />
                    <strong>Success:</strong> {drill.successMetricText}
                    <br />
                    <strong>Why:</strong> {drill.explanation}
                  </li>
                ))}
              </ul>
              <p>
                <strong>Test Set ({allTimePlan20.testSet.durationMin} min):</strong> {allTimePlan20.testSet.name}
              </p>
              <p>
                <strong>How:</strong> {allTimePlan20.testSet.setupText}
              </p>
              <p>
                <strong>Success:</strong> {allTimePlan20.testSet.successMetricText}
              </p>
              <p>
                <strong>Why:</strong> {allTimePlan20.testSet.explanation}
              </p>
              {allTimePlan40 && (
                <details className="term-key">
                  <summary>Optional 40-minute plan</summary>
                  <p>
                    <strong>Target:</strong> {allTimePlan40.targetText}
                  </p>
                  <ul>
                    {allTimePlan40.drills.map((drill) => (
                      <li key={drill.id}>
                        <strong>{drill.name}</strong> ({drill.durationMin} min)
                        <br />
                        <strong>How:</strong> {drill.setupText}
                        <br />
                        <strong>Reps:</strong> {drill.repsText}
                        <br />
                        <strong>Why:</strong> {drill.explanation}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          )}
          {allTime.trendDeltas && (
            <>
              <h3>Trend Deltas</h3>
              <p>{allTime.trendDeltas.summary}</p>
              <table>
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Current</th>
                    <th>Baseline</th>
                    <th>Delta</th>
                    <th>Direction</th>
                  </tr>
                </thead>
                <tbody>
                  {allTime.trendDeltas.metrics.map((metric) => (
                    <tr key={metric.key}>
                      <td data-label="Metric">{metric.label}</td>
                      <td data-label="Current">{formatNumber(metric.current, ` ${metric.unit}`)}</td>
                      <td data-label="Baseline">{formatNumber(metric.baseline, ` ${metric.unit}`)}</td>
                      <td data-label="Delta">{formatTrendDelta(metric.delta, metric.unit)}</td>
                      <td data-label="Direction">{metric.direction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {allTime.ruleInsights.length > 0 && (
            <>
              <h3>If-Then Insights</h3>
              <ul className="insights-list">
                {allTime.ruleInsights.map((insight) => (
                  <li key={insight.id} className={`insight insight-${insight.severity}`}>
                    <strong>{insight.title}:</strong> {insight.ifThen} Evidence: {insight.evidence} Action: {insight.action}
                  </li>
                ))}
              </ul>
            </>
          )}
            </>
          )}
        </CollapsibleSection>
      )}

      <CollapsibleSection
        title="Saved Sessions"
        isOpen={showSavedSessions}
        onToggle={() => setShowSavedSessions((value) => !value)}
      >
        {!sessions.length ? (
          <p className="helper-text">No saved sessions yet. Upload and save your first range session.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Source File</th>
                <th>Shots</th>
                <th>Avg Carry</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((entry) => (
                <tr key={entry.id}>
                    <td data-label="Date">{formatDateTime(entry.sessionDate)}</td>
                  <td data-label="Source File">{entry.sourceFile ?? '-'}</td>
                  <td data-label="Shots">{entry.shots}</td>
                  <td data-label="Avg Carry">{formatNumber(entry.avgCarryYds, ' yds')}</td>
                    <td data-label="Action">
                      <div className="row-actions">
                        <button type="button" onClick={() => void loadSession(entry.id)} disabled={loadingSessionId === entry.id}>
                          {loadingSessionId === entry.id ? 'Loading...' : 'Open'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteSession(entry.id)}
                          disabled={deletingSessionId === entry.id}
                        >
                          {deletingSessionId === entry.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CollapsibleSection>

      {selectedSession && (
        <CollapsibleSection
          title="Session Detail"
          isOpen={showSessionDetail}
          onToggle={() => setShowSessionDetail((value) => !value)}
          className="session-detail-sticky"
        >
          <p>
            {formatDateTime(selectedSession.sessionDate)} |{' '}
            {selectedSession.sourceFile ?? 'Unknown source'}
          </p>
          <p>
            Shots: {selectedSession.summary.shots} | Avg carry:{' '}
            {formatNumber(selectedSession.summary.avgCarryYds, ' yds')}
          </p>
          <p>
            Clubs tracked: {selectedSession.summary.clubs.length} | Gap alerts:{' '}
            {selectedSession.gappingLadder.rows.filter((row) => row.gapStatus === 'overlap' || row.gapStatus === 'cliff').length}
          </p>
          <div className="flow-tabs sticky-flow-tabs" role="tablist" aria-label="Session insight tabs">
            <button
              type="button"
              className={sessionView === 'coach' ? 'flow-tab active' : 'flow-tab'}
              onClick={() => setSessionView('coach')}
            >
              Coach
            </button>
            <button
              type="button"
              className={sessionView === 'gapping' ? 'flow-tab active' : 'flow-tab'}
              onClick={() => setSessionView('gapping')}
            >
              Gapping Ladder
            </button>
            <button
              type="button"
              className={sessionView === 'deepdive' ? 'flow-tab active' : 'flow-tab'}
              onClick={() => setSessionView('deepdive')}
            >
              Deep Dive
            </button>
          </div>
          <section className="summary-grid" aria-label="Session issue summary">
            <article>
              <h3>Primary Issue</h3>
              <p>{sessionPrimaryIssue}</p>
            </article>
            <article>
              <h3>Club</h3>
              <p>{sessionPrimaryClub}</p>
            </article>
            <article>
              <h3>Key Metric</h3>
              <p>
                {sessionPrimaryMetricLabel}:{' '}
                {typeof sessionPrimaryMetricValue === 'number' ? sessionPrimaryMetricValue.toFixed(2) : 'n/a'}
              </p>
            </article>
            <article>
              <h3>Target</h3>
              <p>{sessionPrimaryTarget}</p>
            </article>
          </section>
          {sessionView === 'deepdive' && (
            <section className="full-range-data">
              <div className="full-range-controls">
                <label htmlFor="full-data-club-filter">Club filter</label>
                <select
                  id="full-data-club-filter"
                  value={fullDataClubFilter}
                  onChange={(event) => setFullDataClubFilter(event.target.value)}
                >
                  <option value="all">All clubs</option>
                  {availableSessionClubs.map((club) => (
                    <option key={club} value={club}>
                      {club}
                    </option>
                  ))}
                </select>
              </div>
              <div className="metrics-picker" role="group" aria-label="Visible metrics">
                <span>Visible metrics</span>
                {metricKeys.map((key) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={visibleMetrics.includes(key)}
                      onChange={() =>
                        setVisibleMetrics((current) => {
                          const exists = current.includes(key);
                          if (exists) {
                            const next = current.filter((value) => value !== key);
                            return next.length ? next : current;
                          }
                          return [...current, key];
                        })
                      }
                    />
                    {metricConfig[key].label}
                  </label>
                ))}
              </div>
              <div className="sort-controls">
                <label htmlFor="shot-sort-metric">Sort shots by</label>
                <select
                  id="shot-sort-metric"
                  value={shotSortMetric}
                  onChange={(event) =>
                    setShotSortMetric(event.target.value as 'shotIndex' | 'club' | 'outlier' | MetricKey)
                  }
                >
                  <option value="shotIndex">Shot Order</option>
                  <option value="club">Club</option>
                  <option value="outlier">Outlier</option>
                  {metricKeys.map((key) => (
                    <option key={key} value={key}>
                      {metricConfig[key].label}
                    </option>
                  ))}
                </select>
                <label htmlFor="shot-sort-direction">Direction</label>
                <select
                  id="shot-sort-direction"
                  value={shotSortDirection}
                  onChange={(event) => setShotSortDirection(event.target.value as 'asc' | 'desc')}
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </div>
              <section className="summary-grid" aria-label="Full data ranges">
                <article>
                  <h3>Visible Shots</h3>
                  <p>{fullDataShots.length}</p>
                </article>
                {visibleMetrics.map((key) => (
                  <article key={key}>
                    <h3>{metricConfig[key].label} Range</h3>
                    <p>
                      {formatValue(fullDataRanges[key].min, metricConfig[key].suffix)} -{' '}
                      {formatValue(fullDataRanges[key].max, metricConfig[key].suffix)}
                    </p>
                  </article>
                ))}
              </section>

              <div className="viz-grid">
                <article className={expandedViz === 'trend' ? 'viz-card large' : 'viz-card'}>
                  <div className="viz-toolbar">
                    <h3>{metricConfig[trendMetric].label} By Shot</h3>
                    <div>
                      <label htmlFor="trend-metric">Metric</label>
                      <select
                        id="trend-metric"
                        value={trendMetric}
                        onChange={(event) => setTrendMetric(event.target.value as MetricKey)}
                      >
                        {visibleMetrics.map((key) => (
                          <option key={key} value={key}>
                            {metricConfig[key].label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setExpandedViz((value) => (value === 'trend' ? null : 'trend'))}
                      >
                        {expandedViz === 'trend' ? 'Normal Size' : 'Enlarge'}
                      </button>
                    </div>
                  </div>
                  {trendPoints ? (
                    <svg viewBox="0 0 520 160" role="img" aria-label="Carry by shot trend chart">
                      <polyline points={trendPoints} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
                    </svg>
                  ) : (
                    <p className="helper-text">Not enough values for trend line.</p>
                  )}
                </article>
                <article className={expandedViz === 'scatter' ? 'viz-card large' : 'viz-card'}>
                  <div className="viz-toolbar">
                    <h3>
                      Scatter ({metricConfig[scatterXMetric].label} vs {metricConfig[scatterYMetric].label})
                    </h3>
                    <div>
                      <label htmlFor="scatter-x">X</label>
                      <select
                        id="scatter-x"
                        value={scatterXMetric}
                        onChange={(event) => setScatterXMetric(event.target.value as MetricKey)}
                      >
                        {visibleMetrics.map((key) => (
                          <option key={key} value={key}>
                            {metricConfig[key].label}
                          </option>
                        ))}
                      </select>
                      <label htmlFor="scatter-y">Y</label>
                      <select
                        id="scatter-y"
                        value={scatterYMetric}
                        onChange={(event) => setScatterYMetric(event.target.value as MetricKey)}
                      >
                        {visibleMetrics.map((key) => (
                          <option key={key} value={key}>
                            {metricConfig[key].label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setExpandedViz((value) => (value === 'scatter' ? null : 'scatter'))}
                      >
                        {expandedViz === 'scatter' ? 'Normal Size' : 'Enlarge'}
                      </button>
                    </div>
                  </div>
                  {dispersionPoints.length > 0 ? (
                    <svg viewBox="0 0 520 220" role="img" aria-label="Dispersion scatter chart">
                      {dispersionPoints.map((point, index) => (
                        <circle
                          key={`${point.x}-${point.y}-${index}`}
                          cx={point.x}
                          cy={point.y}
                          r={3.2}
                          fill={point.isOutlier ? '#f87171' : 'var(--accent)'}
                        />
                      ))}
                    </svg>
                  ) : (
                    <p className="helper-text">Need both selected metric values to plot scatter.</p>
                  )}
                </article>
              </div>

              <h3>Individual Shots</h3>
              {!sortedFullDataShots.length ? (
                <p className="helper-text">No shots match this filter.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Club</th>
                      {visibleMetrics.map((key) => (
                        <th key={key}>{metricConfig[key].label}</th>
                      ))}
                      <th>Outlier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedFullDataShots.map(({ shot, index }) => (
                      <tr key={`${shot.displayClub}-${index}-${shot.carryYds ?? 'na'}`}>
                        <td data-label="#">{index + 1}</td>
                        <td data-label="Club">{shot.displayClub}</td>
                        {visibleMetrics.map((key) => (
                          <td key={key} data-label={metricConfig[key].label}>
                            {formatValue(metricConfig[key].read(shot), metricConfig[key].suffix)}
                          </td>
                        ))}
                        <td data-label="Outlier">{shot.isOutlier ? 'Yes' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}
          {sessionView === 'gapping' && (
            <>
              <h3>Gapping Ladder</h3>
              {selectedSession.gappingLadder.rows.length === 0 ? (
                <p className="helper-text">No gapping ladder rows in this session.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Club</th>
                      <th>Median Carry</th>
                      <th>P10-P90 Carry</th>
                      <th>Gap To Next</th>
                      <th>Status</th>
                      <th>Warning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSession.gappingLadder.rows.map((row) => (
                      <tr key={row.club}>
                        <td data-label="Club">{row.displayClub}</td>
                        <td data-label="Median Carry">{formatNumber(row.medianCarryYds, ' yds')}</td>
                        <td data-label="P10-P90 Carry">{formatRange(row.p10CarryYds, row.p90CarryYds, ' yds')}</td>
                        <td data-label="Gap To Next">{formatNumber(row.gapToNextYds, ' yds')}</td>
                        <td data-label="Status">
                          <span className={`gap-badge ${row.gapStatus ? `gap-${row.gapStatus}` : 'gap-none'}`}>
                            {formatGapStatus(row.gapStatus)}
                          </span>
                        </td>
                        <td data-label="Warning">{row.warning ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
          {sessionView === 'coach' && selectedSession.coachV2Plan && (
            <>
              {selectedSessionDiagnosis && (
                <>
                  <h3>Coach: Primary Issue</h3>
                  <p>
                    <strong>{selectedSessionDiagnosis.primary.constraintType}</strong> on{' '}
                    <strong>{selectedSessionDiagnosis.primary.club}</strong> (confidence: {selectedSessionDiagnosis.primary.confidence})
                  </p>
                  <p>
                    <strong>Key metric:</strong> {selectedPrimaryMetricLabel ?? 'n/a'}{' '}
                    {typeof selectedPrimaryMetricValue === 'number' ? `= ${selectedPrimaryMetricValue.toFixed(2)}` : '= n/a'}
                  </p>
                  <p>
                    <strong>Target suggestion:</strong> Reduce {selectedPrimaryMetricLabel ?? 'this metric'} by 15-20% over the next 3
                    sessions.
                  </p>
                  <p>
                    <strong>Reason:</strong> {selectedSessionDiagnosis.primary.scoreBreakdown.formula} |{' '}
                    {formatBreakdownTerms(selectedSessionDiagnosis.primary.scoreBreakdown.terms)} | score=
                    {selectedSessionDiagnosis.primary.severityScore.toFixed(2)}
                  </p>
                  {selectedSessionDiagnosis.secondary && (
                    <>
                      <p>
                        <strong>Secondary issue:</strong> {selectedSessionDiagnosis.secondary.constraintType} on{' '}
                        {selectedSessionDiagnosis.secondary.club}
                      </p>
                      <p>
                        <strong>Secondary reason:</strong> {selectedSessionDiagnosis.secondary.scoreBreakdown.formula} |{' '}
                        {formatBreakdownTerms(selectedSessionDiagnosis.secondary.scoreBreakdown.terms)} | score=
                        {selectedSessionDiagnosis.secondary.severityScore.toFixed(2)}
                      </p>
                    </>
                  )}
                  {selectedSessionPlan20 && (
                    <section className="coach-card" aria-label="Session plan">
                      <h3>Today&apos;s Plan (20 min)</h3>
                      <p>
                        <strong>Target:</strong> {selectedSessionPlan20.targetText}
                      </p>
                      <p>
                        <strong>Warmup ({selectedSessionPlan20.warmup.durationMin} min):</strong> {selectedSessionPlan20.warmup.name} -{' '}
                        {selectedSessionPlan20.warmup.repsText}
                      </p>
                      <p>
                        <strong>How:</strong> {selectedSessionPlan20.warmup.setupText}
                      </p>
                      <p>
                        <strong>Why:</strong> {selectedSessionPlan20.warmup.explanation}
                      </p>
                      <ul>
                        {selectedSessionPlan20.drills.map((drill) => (
                          <li key={drill.id}>
                            <strong>{drill.name}</strong> ({drill.durationMin} min)
                            <br />
                            <strong>How:</strong> {drill.setupText}
                            <br />
                            <strong>Reps:</strong> {drill.repsText}
                            <br />
                            <strong>Success:</strong> {drill.successMetricText}
                            <br />
                            <strong>Why:</strong> {drill.explanation}
                          </li>
                        ))}
                      </ul>
                      <p>
                        <strong>Test Set ({selectedSessionPlan20.testSet.durationMin} min):</strong> {selectedSessionPlan20.testSet.name}
                      </p>
                      <p>
                        <strong>How:</strong> {selectedSessionPlan20.testSet.setupText}
                      </p>
                      <p>
                        <strong>Success:</strong> {selectedSessionPlan20.testSet.successMetricText}
                      </p>
                      <p>
                        <strong>Why:</strong> {selectedSessionPlan20.testSet.explanation}
                      </p>
                      {selectedSessionPlan40 && (
                        <details className="term-key">
                          <summary>Optional 40-minute plan</summary>
                          <p>
                            <strong>Target:</strong> {selectedSessionPlan40.targetText}
                          </p>
                          <ul>
                            {selectedSessionPlan40.drills.map((drill) => (
                              <li key={drill.id}>
                                <strong>{drill.name}</strong> ({drill.durationMin} min)
                                <br />
                                <strong>How:</strong> {drill.setupText}
                                <br />
                                <strong>Reps:</strong> {drill.repsText}
                                <br />
                                <strong>Why:</strong> {drill.explanation}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </section>
                  )}
                </>
              )}
              {selectedSessionMissPatterns && (
                <>
                  <section className="summary-grid" aria-label="Miss pattern summary">
                    <article>
                      <h3>Most common miss</h3>
                      <p>{selectedSessionMissPatterns.overall.topShape}</p>
                    </article>
                    <article>
                      <h3>Severe offline shots</h3>
                      <p>{selectedSessionMissPatterns.overall.severePct.toFixed(1)}%</p>
                    </article>
                    <article>
                      <h3>Top severe shape</h3>
                      <p>{selectedSessionMissPatterns.overall.topSevereShape ?? 'None'}</p>
                    </article>
                  </section>
                  <h3>Top miss shapes</h3>
                  <ul>
                    {selectedSessionTopThreeShapes.map(([shape, pct]) => (
                      <li key={shape}>
                        {shape}: {pct.toFixed(1)}%
                      </li>
                    ))}
                  </ul>
                  <h3>Per-club miss pattern</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Club</th>
                        <th>Most Common Miss</th>
                        <th>Severe %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(selectedSessionMissPatterns.perClub).map(([club, clubPattern]) => (
                        <tr key={club}>
                          <td data-label="Club">{club}</td>
                          <td data-label="Most Common Miss">{clubPattern.topShape}</td>
                          <td data-label="Severe %">{clubPattern.severePct.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
              <p>
                <strong>Coach focus:</strong> {selectedSession.coachV2Plan.primaryConstraint.label}
              </p>
              <p>
                <strong>Target:</strong> {selectedSession.coachV2Plan.practicePlan.goal}
              </p>
              <p>
                <button type="button" onClick={() => void snapshotAnalysis()}>
                  Save Analysis Snapshot
                </button>
                {analysisStatus ? ` ${analysisStatus}` : ''}
              </p>
              <p>
                <button type="button" onClick={() => void generateSummary()}>
                  Generate Coach Summary
                </button>
                {summaryStatus ? ` ${summaryStatus}` : ''}
              </p>
              {coachSummary && (
                <>
                  <p>
                    <strong>Coach summary ({coachSummary.source}{coachSummary.model ? `:${coachSummary.model}` : ''}):</strong>{' '}
                    {coachSummary.text}
                  </p>
                  <p>
                    <strong>Why this happens:</strong> {coachSummary.whyThisHappens}
                  </p>
                  <p>
                    <strong>What to do next:</strong> {coachSummary.whatToDoNext}
                  </p>
                  <p>
                    <strong>On-course tip:</strong> {coachSummary.onCourseTip}
                  </p>
                </>
              )}
            </>
          )}
          {sessionView === 'coach' && selectedSession.trendDeltas && (
            <>
              <p>
                <strong>Trend:</strong> {selectedSession.trendDeltas.summary}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Current</th>
                    <th>Baseline</th>
                    <th>Delta</th>
                    <th>Direction</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSession.trendDeltas.metrics.map((metric) => (
                    <tr key={metric.key}>
                      <td data-label="Metric">{metric.label}</td>
                      <td data-label="Current">{formatNumber(metric.current, ` ${metric.unit}`)}</td>
                      <td data-label="Baseline">{formatNumber(metric.baseline, ` ${metric.unit}`)}</td>
                      <td data-label="Delta">{formatTrendDelta(metric.delta, metric.unit)}</td>
                      <td data-label="Direction">{metric.direction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {sessionView === 'coach' && selectedSession.ruleInsights.length > 0 && (
            <ul className="insights-list">
              {selectedSession.ruleInsights.map((insight) => (
                <li key={insight.id} className={`insight insight-${insight.severity}`}>
                  <strong>{insight.title}:</strong> {insight.ifThen} Evidence: {insight.evidence} Action: {insight.action}
                </li>
              ))}
            </ul>
          )}
        </CollapsibleSection>
      )}
    </section>
  );
}
