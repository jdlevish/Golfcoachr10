import type { ClubStatsConfidence, NormalizedShot } from '@/lib/r10';

export type ConstraintType =
  | 'DirectionConsistency'
  | 'FaceControl'
  | 'DistanceControl'
  | 'StrikeQuality';

export type DiagnosisConstraint = {
  constraintType: ConstraintType;
  club: string;
  severityScore: number;
  confidence: ClubStatsConfidence;
  keyMetrics: Record<string, number | null>;
  scoreBreakdown: {
    formula: string;
    terms: Record<string, number | null>;
  };
};

export type CoachDiagnosis = {
  primary: DiagnosisConstraint;
  secondary?: DiagnosisConstraint;
  sessionHighlights: {
    bestClubByConsistency?: string;
    mostInconsistentClub?: string;
    bestClubByDistanceControl?: string;
    mostInconsistentDistanceClub?: string;
  };
};

type ClubComputedStats = {
  club: string;
  count: number;
  confidence: ClubStatsConfidence;
  offlineMean: number | null;
  offlineStdDev: number | null;
  faceToPathMean: number | null;
  faceToPathStdDev: number | null;
  carryStdDev: number | null;
  smashMedian: number | null;
  smashStdDev: number | null;
  smashThreshold: number;
  smashPenalty: number | null;
  directionScore: number | null;
  faceControlScore: number | null;
  distanceControlScore: number | null;
  strikeQualityScore: number | null;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

const toConfidence = (count: number): ClubStatsConfidence => {
  if (count >= 25) return 'High';
  if (count >= 12) return 'Medium';
  return 'Low';
};

const numericValues = (values: Array<number | null | undefined>) =>
  values.filter((value): value is number => typeof value === 'number');

const mean = (values: number[]) => {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const stdDev = (values: number[]) => {
  if (values.length < 2) return null;
  const m = mean(values);
  if (m === null) return null;
  const variance = values.reduce((sum, value) => sum + (value - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
};

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
};

const isDriverOrWood = (club: string) => {
  const normalized = club.toLowerCase();
  return normalized.includes('driver') || normalized.includes('wood');
};

const buildClubStats = (club: string, shots: NormalizedShot[]): ClubComputedStats => {
  const offlineValues = numericValues(
    shots.map((shot) => shot.carryDeviationDistance ?? shot.totalDeviationDistance ?? null)
  );
  const faceToPathValues = numericValues(shots.map((shot) => shot.faceToPath));
  const carryValues = numericValues(shots.map((shot) => shot.carryDistance));
  const smashValues = numericValues(shots.map((shot) => shot.smashFactor));

  const offlineMean = mean(offlineValues);
  const offlineStd = stdDev(offlineValues);
  const faceToPathMean = mean(faceToPathValues);
  const faceToPathStd = stdDev(faceToPathValues);
  const carryStd = stdDev(carryValues);
  const smashMed = median(smashValues);
  const smashStd = stdDev(smashValues);
  const smashThreshold = isDriverOrWood(club) ? 1.45 : 1.35;
  const smashPenalty =
    smashMed === null || smashMed >= smashThreshold ? 0 : round2(smashThreshold - smashMed);

  const directionScore =
    offlineStd === null && offlineMean === null
      ? null
      : round2((offlineStd ?? 0) + 0.5 * Math.abs(offlineMean ?? 0));
  const faceControlScore =
    faceToPathMean === null && faceToPathStd === null
      ? null
      : round2(Math.abs(faceToPathMean ?? 0) + (faceToPathStd ?? 0));
  const distanceControlScore = carryStd === null ? null : round2(carryStd);
  const strikeQualityScore =
    smashStd === null && smashMed === null ? null : round2((smashStd ?? 0) + (smashPenalty ?? 0));

  return {
    club,
    count: shots.length,
    confidence: toConfidence(shots.length),
    offlineMean: offlineMean === null ? null : round2(offlineMean),
    offlineStdDev: offlineStd === null ? null : round2(offlineStd),
    faceToPathMean: faceToPathMean === null ? null : round2(faceToPathMean),
    faceToPathStdDev: faceToPathStd === null ? null : round2(faceToPathStd),
    carryStdDev: carryStd === null ? null : round2(carryStd),
    smashMedian: smashMed === null ? null : round2(smashMed),
    smashStdDev: smashStd === null ? null : round2(smashStd),
    smashThreshold,
    smashPenalty,
    directionScore,
    faceControlScore,
    distanceControlScore,
    strikeQualityScore
  };
};

const toConstraintEntries = (clubStats: ClubComputedStats): DiagnosisConstraint[] => {
  const entries: DiagnosisConstraint[] = [];
  if (clubStats.directionScore !== null) {
    entries.push({
      constraintType: 'DirectionConsistency',
      club: clubStats.club,
      severityScore: clubStats.directionScore,
      confidence: clubStats.confidence,
      keyMetrics: {
        count: clubStats.count,
        offlineStdDev: clubStats.offlineStdDev,
        offlineMean: clubStats.offlineMean
      },
      scoreBreakdown: {
        formula: 'offlineStdDev + 0.5 * abs(offlineMean)',
        terms: {
          offlineStdDev: clubStats.offlineStdDev,
          absOfflineMean: clubStats.offlineMean === null ? null : round2(Math.abs(clubStats.offlineMean))
        }
      }
    });
  }
  if (clubStats.faceControlScore !== null) {
    entries.push({
      constraintType: 'FaceControl',
      club: clubStats.club,
      severityScore: clubStats.faceControlScore,
      confidence: clubStats.confidence,
      keyMetrics: {
        count: clubStats.count,
        faceToPathMean: clubStats.faceToPathMean,
        faceToPathStdDev: clubStats.faceToPathStdDev
      },
      scoreBreakdown: {
        formula: 'abs(faceToPathMean) + faceToPathStdDev',
        terms: {
          absFaceToPathMean:
            clubStats.faceToPathMean === null ? null : round2(Math.abs(clubStats.faceToPathMean)),
          faceToPathStdDev: clubStats.faceToPathStdDev
        }
      }
    });
  }
  if (clubStats.distanceControlScore !== null) {
    entries.push({
      constraintType: 'DistanceControl',
      club: clubStats.club,
      severityScore: clubStats.distanceControlScore,
      confidence: clubStats.confidence,
      keyMetrics: {
        count: clubStats.count,
        carryStdDev: clubStats.carryStdDev
      },
      scoreBreakdown: {
        formula: 'carryStdDev',
        terms: {
          carryStdDev: clubStats.carryStdDev
        }
      }
    });
  }
  if (clubStats.strikeQualityScore !== null) {
    entries.push({
      constraintType: 'StrikeQuality',
      club: clubStats.club,
      severityScore: clubStats.strikeQualityScore,
      confidence: clubStats.confidence,
      keyMetrics: {
        count: clubStats.count,
        smashStdDev: clubStats.smashStdDev,
        smashMedian: clubStats.smashMedian,
        smashThreshold: clubStats.smashThreshold,
        smashPenalty: clubStats.smashPenalty
      },
      scoreBreakdown: {
        formula: 'smashStdDev + smashPenalty',
        terms: {
          smashStdDev: clubStats.smashStdDev,
          smashPenalty: clubStats.smashPenalty,
          smashMedian: clubStats.smashMedian,
          smashThreshold: clubStats.smashThreshold
        }
      }
    });
  }
  return entries;
};

const fallbackDiagnosis = (): CoachDiagnosis => ({
  primary: {
    constraintType: 'DistanceControl',
    club: 'Session',
    severityScore: 0,
    confidence: 'Low',
    keyMetrics: {},
    scoreBreakdown: {
      formula: 'insufficient data',
      terms: {}
    }
  },
  sessionHighlights: {}
});

const topBy = <T>(items: T[], selector: (item: T) => number | null, order: 'asc' | 'desc') => {
  const valid = items.filter((item) => selector(item) !== null);
  if (!valid.length) return null;
  return [...valid].sort((a, b) => {
    const av = selector(a) as number;
    const bv = selector(b) as number;
    return order === 'asc' ? av - bv : bv - av;
  })[0];
};

export const computeCoachDiagnosis = (shots: NormalizedShot[]): CoachDiagnosis => {
  if (!shots.length) return fallbackDiagnosis();

  const grouped = new Map<string, NormalizedShot[]>();
  for (const shot of shots) {
    const key = shot.club || 'Unknown';
    const list = grouped.get(key) ?? [];
    list.push(shot);
    grouped.set(key, list);
  }

  const perClubStats = Array.from(grouped.entries()).map(([club, clubShots]) => buildClubStats(club, clubShots));
  const allEntries = perClubStats.flatMap(toConstraintEntries);

  if (!allEntries.length) {
    const sessionStats = buildClubStats('Session', shots);
    const fallbackEntries = toConstraintEntries(sessionStats);
    if (!fallbackEntries.length) return fallbackDiagnosis();
    const primary = fallbackEntries.sort((a, b) => b.severityScore - a.severityScore)[0];
    return { primary, sessionHighlights: {} };
  }

  const nonLowEntries = allEntries.filter((entry) => entry.confidence !== 'Low');
  const eligibleEntries = nonLowEntries.length > 0 ? nonLowEntries : allEntries;
  const sorted = [...eligibleEntries].sort((a, b) => b.severityScore - a.severityScore);
  const primary = sorted[0];
  const secondary = sorted.find(
    (entry) => entry !== primary && (entry.constraintType !== primary.constraintType || entry.club !== primary.club)
  );

  const bestConsistency = topBy(perClubStats, (club) => club.directionScore, 'asc');
  const worstConsistency = topBy(perClubStats, (club) => club.directionScore, 'desc');
  const bestDistance = topBy(perClubStats, (club) => club.distanceControlScore, 'asc');
  const worstDistance = topBy(perClubStats, (club) => club.distanceControlScore, 'desc');

  return {
    primary,
    secondary: secondary ?? undefined,
    sessionHighlights: {
      bestClubByConsistency: bestConsistency?.club,
      mostInconsistentClub: worstConsistency?.club,
      bestClubByDistanceControl: bestDistance?.club,
      mostInconsistentDistanceClub: worstDistance?.club
    }
  };
};
