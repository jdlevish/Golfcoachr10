import { buildCoachV2Plan } from '@/lib/coach-v2';
import { buildGappingLadder, type GappingLadder, type SessionSummary, type ShotRecord } from '@/lib/r10';
import type { TrendDirection, TrendDeltas, RuleInsight, MetricDelta } from '@/types/analysis';

const RULE_MIN_SHOTS_FOR_SPEED_CARRY = 20;
const RULE_MIN_SHOTS_FOR_FATIGUE = 70;
const RULE_FATIGUE_SPLIT_SHOT = 60;
const RULE_MIN_TOP_CLUB_SHOTS = 8;
const RULE_TOP_CLUB_OFFLINE_STD = 15;
const RULE_SPEED_CARRY_CORRELATION = 0.55;
const RULE_FATIGUE_MULTIPLIER = 1.2;

export type DrillMemoryLog = {
  constraintKey: string | null;
  drillName: string;
  perceivedOutcome: number | null;
  completedAt: Date | string;
};

const round1 = (value: number) => Math.round(value * 10) / 10;

const toDirection = (delta: number | null, lowerIsBetter: boolean): TrendDirection => {
  if (delta === null) return 'insufficient';
  if (Math.abs(delta) < 0.1) return 'flat';
  if (lowerIsBetter) return delta < 0 ? 'improved' : 'worsened';
  return delta > 0 ? 'improved' : 'worsened';
};

const buildMetricDelta = (
  key: string,
  label: string,
  current: number | null,
  baseline: number | null,
  unit: string,
  lowerIsBetter: boolean
): MetricDelta => {
  const delta = current === null || baseline === null ? null : round1(current - baseline);
  return {
    key,
    label,
    current,
    baseline,
    delta,
    direction: toDirection(delta, lowerIsBetter),
    unit
  };
};

const summarizeTrend = (metrics: MetricDelta[], hasBaseline: boolean) => {
  if (!hasBaseline) {
    return 'No baseline yet. Save another session to unlock deterministic progress deltas.';
  }

  const improved = metrics.filter((metric) => metric.direction === 'improved').length;
  const worsened = metrics.filter((metric) => metric.direction === 'worsened').length;
  const flat = metrics.filter((metric) => metric.direction === 'flat').length;
  return `Trend check: ${improved} improved, ${worsened} worsened, ${flat} flat vs baseline.`;
};

const stdDev = (values: number[]) => {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
};

const correlation = (x: number[], y: number[]) => {
  if (x.length < 3 || y.length !== x.length) return null;
  const meanX = x.reduce((sum, value) => sum + value, 0) / x.length;
  const meanY = y.reduce((sum, value) => sum + value, 0) / y.length;
  let numerator = 0;
  let denominatorX = 0;
  let denominatorY = 0;
  for (let i = 0; i < x.length; i += 1) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    numerator += dx * dy;
    denominatorX += dx * dx;
    denominatorY += dy * dy;
  }
  if (denominatorX === 0 || denominatorY === 0) return null;
  return numerator / Math.sqrt(denominatorX * denominatorY);
};

const topClubByShotCount = (summary: SessionSummary) =>
  [...summary.clubs].sort((a, b) => b.shots - a.shots)[0] ?? null;

export const buildTrendDeltas = (
  latestSummary: SessionSummary,
  latestLadder: GappingLadder,
  latestSessionCount: number,
  baselineSummary: SessionSummary | null,
  baselineSessionCount: number
): TrendDeltas => {
  const latestCoach = buildCoachV2Plan(latestSummary, latestLadder, { sessionsAnalyzed: latestSessionCount });
  const baselineLadder = baselineSummary ? buildGappingLadder(baselineSummary) : null;
  const baselineCoach =
    baselineSummary && baselineLadder
      ? buildCoachV2Plan(baselineSummary, baselineLadder, { sessionsAnalyzed: baselineSessionCount })
      : null;

  const latestGapAlerts = latestLadder.rows.filter(
    (row) => row.gapStatus === 'overlap' || row.gapStatus === 'compressed' || row.gapStatus === 'cliff'
  ).length;
  const baselineGapAlerts =
    baselineLadder?.rows.filter(
      (row) => row.gapStatus === 'overlap' || row.gapStatus === 'compressed' || row.gapStatus === 'cliff'
    ).length ?? null;

  const metrics: MetricDelta[] = [
    buildMetricDelta(
      'avg_carry_yds',
      'Average carry',
      latestSummary.avgCarryYds,
      baselineSummary?.avgCarryYds ?? null,
      'yds',
      false
    ),
    buildMetricDelta(
      'avg_ball_speed_mph',
      'Average ball speed',
      latestSummary.avgBallSpeedMph,
      baselineSummary?.avgBallSpeedMph ?? null,
      'mph',
      false
    ),
    buildMetricDelta(
      'gap_alerts',
      'Gap alerts',
      latestGapAlerts,
      baselineGapAlerts,
      'alerts',
      true
    )
  ];

  const primaryConstraintDelta =
    latestCoach && baselineCoach
      ? {
          label: latestCoach.primaryConstraint.label,
          currentScore: latestCoach.primaryConstraint.score,
          baselineScore:
            baselineCoach.constraintScores.find(
              (score) => score.key === latestCoach.primaryConstraint.key
            )?.score ?? baselineCoach.primaryConstraint.score,
          deltaScore:
            latestCoach.primaryConstraint.score -
            (baselineCoach.constraintScores.find(
              (score) => score.key === latestCoach.primaryConstraint.key
            )?.score ?? baselineCoach.primaryConstraint.score),
          direction: toDirection(
            latestCoach.primaryConstraint.score -
              (baselineCoach.constraintScores.find(
                (score) => score.key === latestCoach.primaryConstraint.key
              )?.score ?? baselineCoach.primaryConstraint.score),
            true
          )
        }
      : null;

  return {
    baselineSessions: baselineSessionCount,
    hasBaseline: Boolean(baselineSummary),
    metrics,
    primaryConstraintDelta,
    summary: summarizeTrend(metrics, Boolean(baselineSummary))
  };
};

export const buildRuleInsights = (
  shots: ShotRecord[],
  summary: SessionSummary,
  ladder: GappingLadder,
  drillLogs: DrillMemoryLog[] = []
): RuleInsight[] => {
  const insights: RuleInsight[] = [];

  const speedCarryPairs = shots
    .filter((shot) => shot.ballSpeedMph !== null && shot.carryYds !== null)
    .map((shot) => ({ speed: shot.ballSpeedMph as number, carry: shot.carryYds as number }));
  const speedCarryCorrelation = correlation(
    speedCarryPairs.map((pair) => pair.speed),
    speedCarryPairs.map((pair) => pair.carry)
  );
  if (
    speedCarryCorrelation !== null &&
    speedCarryCorrelation > RULE_SPEED_CARRY_CORRELATION &&
    speedCarryPairs.length >= RULE_MIN_SHOTS_FOR_SPEED_CARRY
  ) {
    insights.push({
      id: 'speed-carry-linked',
      severity: 'info',
      title: 'Speed-carry link detected',
      ifThen: 'If your ball speed stays up, then your carry distance reliably improves.',
      evidence: `Ball speed/carry correlation is ${speedCarryCorrelation.toFixed(2)} over ${speedCarryPairs.length} shot(s).`,
      action: 'Start each session with tempo and centered-contact reps before target practice.'
    });
  }

  if (shots.length >= RULE_MIN_SHOTS_FOR_FATIGUE) {
    const early = shots
      .slice(0, RULE_FATIGUE_SPLIT_SHOT)
      .map((shot) => shot.sideYds)
      .filter((value): value is number => value !== null);
    const late = shots
      .slice(RULE_FATIGUE_SPLIT_SHOT)
      .map((shot) => shot.sideYds)
      .filter((value): value is number => value !== null);
    const earlyStd = stdDev(early);
    const lateStd = stdDev(late);
    if (earlyStd !== null && lateStd !== null && lateStd > earlyStd * RULE_FATIGUE_MULTIPLIER) {
      insights.push({
        id: 'fatigue-dispersion',
        severity: 'warning',
        title: 'Late-session dispersion spike',
        ifThen: 'If the session runs long, then your directional dispersion increases.',
        evidence: `Offline std dev rises from ${round1(earlyStd)} yds (first 60) to ${round1(lateStd)} yds (after 60).`,
        action: 'Insert a reset break every 25-30 balls and end the session when quality declines.'
      });
    }
  }

  const topClub = topClubByShotCount(summary);
  if (
    topClub &&
    topClub.shots >= RULE_MIN_TOP_CLUB_SHOTS &&
    topClub.offlineStdDevYds !== null &&
    topClub.offlineStdDevYds > RULE_TOP_CLUB_OFFLINE_STD
  ) {
    insights.push({
      id: 'top-club-dispersion',
      severity: 'warning',
      title: 'Primary club direction limiter',
      ifThen: `If you tighten start-line with ${topClub.displayName}, then most of this session's dispersion cost will drop.`,
      evidence: `${topClub.displayName} logged ${topClub.shots} shot(s) with ${topClub.offlineStdDevYds.toFixed(1)} yds offline std dev.`,
      action: `Use ${topClub.displayName} as your first 20-ball block with alignment-gate constraints.`
    });
  }

  const severeGapCount = ladder.rows.filter((row) => row.gapStatus === 'overlap' || row.gapStatus === 'cliff').length;
  if (severeGapCount > 0) {
    insights.push({
      id: 'gap-alerts-present',
      severity: severeGapCount >= 2 ? 'danger' : 'warning',
      title: 'Bag spacing risk',
      ifThen: 'If your gap alerts persist, then on-course club selection variance stays high.',
      evidence: `${severeGapCount} severe gap alert(s) detected (overlap/cliff).`,
      action: 'Run a focused gapping retest on the two clubs around each severe alert.'
    });
  }

  const latestCoach = buildCoachV2Plan(summary, ladder, { sessionsAnalyzed: 1 });
  const primaryKey = latestCoach?.primaryConstraint.key ?? null;
  const matchingDrills = primaryKey
    ? drillLogs.filter((log) => log.constraintKey === primaryKey && typeof log.perceivedOutcome === 'number')
    : [];
  if (matchingDrills.length >= 2) {
    const avgOutcome =
      matchingDrills.reduce((sum, log) => sum + (log.perceivedOutcome as number), 0) / matchingDrills.length;
    const bestDrill = [...matchingDrills].sort(
      (a, b) => (b.perceivedOutcome ?? 0) - (a.perceivedOutcome ?? 0)
    )[0];
    insights.push({
      id: 'drill-memory',
      severity: avgOutcome >= 3.8 ? 'info' : 'warning',
      title: 'Drill memory signal',
      ifThen: `If you repeat your proven ${latestCoach?.primaryConstraint.label.toLowerCase()} drill, then next-session execution is more likely to hold.`,
      evidence: `${matchingDrills.length} prior drill log(s) for this constraint; average outcome ${avgOutcome.toFixed(1)}/5.`,
      action:
        avgOutcome >= 3.8
          ? `Start with "${bestDrill.drillName}" for 10-15 balls before adding variability.`
          : `Replace or simplify "${bestDrill.drillName}" and log a fresh outcome after today's session.`
    });
  }

  if (!insights.length) {
    insights.push({
      id: 'no-major-rule-trigger',
      severity: 'info',
      title: 'No major rule alerts',
      ifThen: 'If you repeat this baseline session format, then trend confidence will increase quickly.',
      evidence: 'Current session metrics show no high-risk deterministic rule trigger.',
      action: 'Repeat the same protocol next session to unlock stronger trend deltas.'
    });
  }

  return insights;
};
