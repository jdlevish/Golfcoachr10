import type { GappingLadder, SessionSummary } from '@/lib/r10';
import type {
  CoachConfidence,
  CoachConstraintKey,
  CoachV2Plan,
  ConstraintScore,
  PracticePlan,
  PracticePlanStep
} from '@/types/coach';

type CoachV2Options = {
  sessionsAnalyzed?: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const worstClubByMetric = (
  clubs: SessionSummary['clubs'],
  metricSelector: (club: SessionSummary['clubs'][number]) => number | null
) => {
  let winner: SessionSummary['clubs'][number] | null = null;
  let winnerValue: number | null = null;

  for (const club of clubs) {
    const value = metricSelector(club);
    if (value === null) continue;
    if (winnerValue === null || value > winnerValue) {
      winner = club;
      winnerValue = value;
    }
  }

  return { club: winner, value: winnerValue };
};

const buildDirectionScore = (summary: SessionSummary): ConstraintScore => {
  const worstDirection = worstClubByMetric(summary.clubs, (club) => club.offlineStdDevYds);
  const value = worstDirection.value;
  const score = clamp(Math.round((value ?? 0) * 2.6), 0, 100);

  return {
    key: 'direction_consistency',
    label: 'Direction consistency',
    score,
    reasons: value
      ? [
          `${worstDirection.club?.displayName ?? 'Focus club'} shows the widest offline spread (${value.toFixed(1)} yds std dev).`
        ]
      : ['Not enough offline data yet to score direction consistency reliably.'],
    focusClub: worstDirection.club?.displayName ?? null,
    targetMetric: 'Offline std dev (yds)',
    currentValue: value,
    targetValue: value ? Math.round(value * 0.85 * 10) / 10 : null
  };
};

const buildDistanceScore = (summary: SessionSummary): ConstraintScore => {
  const worstDistance = worstClubByMetric(summary.clubs, (club) => club.carryStdDevYds);
  const value = worstDistance.value;
  const score = clamp(Math.round((value ?? 0) * 3), 0, 100);

  return {
    key: 'distance_control',
    label: 'Distance control',
    score,
    reasons: value
      ? [
          `${worstDistance.club?.displayName ?? 'Focus club'} has the highest carry variance (${value.toFixed(1)} yds std dev).`
        ]
      : ['Not enough carry variance data yet to score distance control reliably.'],
    focusClub: worstDistance.club?.displayName ?? null,
    targetMetric: 'Carry std dev (yds)',
    currentValue: value,
    targetValue: value ? Math.round(value * 0.85 * 10) / 10 : null
  };
};

const buildGappingScore = (summary: SessionSummary, ladder: GappingLadder): ConstraintScore => {
  const overlapCount = ladder.rows.filter((row) => row.gapStatus === 'overlap').length;
  const cliffCount = ladder.rows.filter((row) => row.gapStatus === 'cliff').length;
  const compressedCount = ladder.rows.filter((row) => row.gapStatus === 'compressed').length;
  const score = clamp(overlapCount * 35 + cliffCount * 28 + compressedCount * 12, 0, 100);
  const focusClub =
    ladder.rows.find((row) => row.gapStatus === 'overlap' || row.gapStatus === 'cliff')?.displayClub ?? null;

  return {
    key: 'bag_gapping',
    label: 'Bag gapping',
    score,
    reasons: [
      `Detected ${overlapCount} overlap(s), ${cliffCount} cliff(s), and ${compressedCount} compressed gap(s).`
    ],
    focusClub,
    targetMetric: 'Gap alerts',
    currentValue: overlapCount + cliffCount + compressedCount,
    targetValue: Math.max(0, overlapCount + cliffCount + compressedCount - 1)
  };
};

const buildStrikeScore = (summary: SessionSummary, distanceScore: ConstraintScore): ConstraintScore => {
  const valueProxy = summary.avgBallSpeedMph;
  const score = valueProxy === null ? 0 : clamp(Math.round(distanceScore.score * 0.55), 0, 100);

  return {
    key: 'strike_quality',
    label: 'Strike quality',
    score,
    reasons:
      valueProxy === null
        ? ['Ball speed data is missing, so strike-quality scoring is currently limited.']
        : [
            `Using carry variability as a strike-quality proxy until club-level smash data is available.`
          ],
    focusClub: distanceScore.focusClub,
    targetMetric: 'Strike proxy score',
    currentValue: score,
    targetValue: score > 0 ? Math.max(0, score - 10) : null
  };
};

const toConfidenceLevel = (score: number): CoachConfidence['level'] => {
  if (score >= 75) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
};

const buildConfidence = (
  summary: SessionSummary,
  sessionsAnalyzed: number,
  scores: ConstraintScore[]
): CoachConfidence => {
  const shotsScore = clamp(Math.round(summary.shots / 3), 0, 40);
  const clubsScore = clamp(summary.clubs.length * 3, 0, 25);
  const sessionsScore = clamp(sessionsAnalyzed * 4, 0, 20);
  const populatedSignals = scores.filter((score) => score.currentValue !== null).length;
  const coverageScore = clamp(populatedSignals * 4, 0, 15);
  const score = clamp(shotsScore + clubsScore + sessionsScore + coverageScore, 0, 100);

  const reasons: string[] = [];
  reasons.push(`${summary.shots} shot(s) analyzed across ${summary.clubs.length} club(s).`);
  reasons.push(`${sessionsAnalyzed} saved session(s) included in this analysis.`);
  if (populatedSignals < 3) {
    reasons.push('Some metric families are incomplete, so recommendations are conservative.');
  }

  return {
    level: toConfidenceLevel(score),
    score,
    shotsAnalyzed: summary.shots,
    clubsAnalyzed: summary.clubs.length,
    sessionsAnalyzed,
    reasons
  };
};

const buildPracticeSteps = (constraint: ConstraintScore): PracticePlanStep[] => {
  const focusClub = constraint.focusClub ?? 'focus club';

  if (constraint.key === 'direction_consistency') {
    return [
      { title: `Alignment gate (${focusClub})`, reps: '10 balls', objective: 'Start line control' },
      { title: 'Half-speed face control', reps: '15 balls', objective: 'Reduce offline misses' },
      { title: 'Random target test', reps: '10 balls', objective: 'Transfer to variable targets' }
    ];
  }

  if (constraint.key === 'distance_control') {
    return [
      { title: `Stock carry ladder (${focusClub})`, reps: '12 balls', objective: 'Tighten carry windows' },
      { title: 'Tempo lock block', reps: '10 balls', objective: 'Stabilize strike rhythm' },
      { title: 'Distance challenge', reps: '8 balls', objective: 'Execute with pressure' }
    ];
  }

  if (constraint.key === 'bag_gapping') {
    return [
      { title: 'Gap retest around flagged clubs', reps: '12 balls', objective: 'Validate median carry' },
      { title: 'Neighbor club alternation', reps: '12 balls', objective: 'Confirm separation' },
      { title: 'Final ladder check', reps: '6 balls', objective: 'Verify gap consistency' }
    ];
  }

  return [
    { title: `Centered contact block (${focusClub})`, reps: '12 balls', objective: 'Improve strike quality' },
    { title: 'Speed consistency drill', reps: '10 balls', objective: 'Limit strike-speed swings' },
    { title: 'Transfer set', reps: '8 balls', objective: 'Keep strike quality under variability' }
  ];
};

const buildPracticePlan = (constraint: ConstraintScore, confidence: CoachConfidence): PracticePlan => {
  const durationMinutes = confidence.level === 'high' ? 30 : confidence.level === 'medium' ? 25 : 20;
  const focusClub = constraint.focusClub ? ` (${constraint.focusClub})` : '';
  const goal =
    constraint.currentValue !== null && constraint.targetValue !== null
      ? `${constraint.targetMetric}: ${constraint.currentValue.toFixed(1)} -> ${constraint.targetValue.toFixed(1)}`
      : `Improve ${constraint.label.toLowerCase()} next session with a consistent baseline set.`;

  return {
    durationMinutes,
    focus: `${constraint.label}${focusClub}`,
    goal,
    steps: buildPracticeSteps(constraint)
  };
};

const buildTrendSummary = (
  primary: ConstraintScore,
  secondary: ConstraintScore | null,
  confidence: CoachConfidence
) => {
  const confidencePrefix = `Confidence is ${confidence.level} (${confidence.score}/100)`;
  if (!secondary) {
    return `${confidencePrefix}. Primary focus is ${primary.label.toLowerCase()} this session.`;
  }
  return `${confidencePrefix}. Primary focus is ${primary.label.toLowerCase()}, with ${secondary.label.toLowerCase()} as secondary.`;
};

export const buildCoachV2Plan = (
  summary: SessionSummary,
  ladder: GappingLadder,
  options: CoachV2Options = {}
): CoachV2Plan | null => {
  if (!summary.clubs.length) return null;

  const sessionsAnalyzed = options.sessionsAnalyzed ?? 1;
  const directionScore = buildDirectionScore(summary);
  const distanceScore = buildDistanceScore(summary);
  const gappingScore = buildGappingScore(summary, ladder);
  const strikeScore = buildStrikeScore(summary, distanceScore);

  const sorted = [directionScore, distanceScore, gappingScore, strikeScore].sort((a, b) => b.score - a.score);
  const primaryConstraint = sorted[0];
  const secondaryConstraint = sorted[1]?.score > 0 ? sorted[1] : null;
  const confidence = buildConfidence(summary, sessionsAnalyzed, sorted);
  const practicePlan = buildPracticePlan(primaryConstraint, confidence);

  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    constraintScores: sorted,
    primaryConstraint,
    secondaryConstraint,
    confidence,
    practicePlan,
    trendSummary: buildTrendSummary(primaryConstraint, secondaryConstraint, confidence)
  };
};

export const toLegacyCoachPlan = (plan: CoachV2Plan | null) => {
  if (!plan) return null;

  const title = `Coach v2: Primary limiter is ${plan.primaryConstraint.label.toLowerCase()}`;
  const explanation = plan.primaryConstraint.reasons[0] ?? plan.trendSummary;
  const target = plan.practicePlan.goal;
  const actions = plan.practicePlan.steps.map(
    (step) => `${step.title}: ${step.objective}${step.reps ? ` (${step.reps})` : ''}`
  );

  return {
    primaryLimiter: plan.primaryConstraint.key as CoachConstraintKey,
    title,
    explanation,
    target,
    focusClub: plan.primaryConstraint.focusClub,
    actions
  };
};
