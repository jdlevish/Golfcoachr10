import { computeStats, toNormalizedShotsFromShotRecords, type ShotRecord } from '@/lib/r10';

type CauseType = 'face' | 'path' | 'strike' | 'variance';

type DeltaEntry = {
  metric: string;
  previous: number;
  current: number;
  delta: number;
  unit: string;
};

type ClubDeltaGroup = {
  improved: DeltaEntry[];
  regressed: DeltaEntry[];
  keyDeltaSummary: string;
};

export type SessionComparison = {
  comparedToSessionId: string | null;
  overall: {
    improved: DeltaEntry[];
    regressed: DeltaEntry[];
  };
  clubs: Record<string, ClubDeltaGroup>;
  headlines: string[];
  likelyCause: {
    type: CauseType;
    explanation: string;
  };
};

type ComparableSession = {
  sessionId: string;
  shots: ShotRecord[];
};

const addDelta = (
  improved: DeltaEntry[],
  regressed: DeltaEntry[],
  metric: string,
  previous: number | null,
  current: number | null,
  unit: string,
  direction: 'higher_better' | 'lower_better' | 'abs_zero_better'
) => {
  if (previous === null || current === null) return;
  const delta = current - previous;
  if (delta === 0) return;

  const entry: DeltaEntry = {
    metric,
    previous,
    current,
    delta,
    unit
  };

  let isImproved = false;
  if (direction === 'higher_better') {
    isImproved = delta > 0;
  } else if (direction === 'lower_better') {
    isImproved = delta < 0;
  } else {
    isImproved = Math.abs(current) < Math.abs(previous);
  }

  if (isImproved) {
    improved.push(entry);
  } else {
    regressed.push(entry);
  }
};

const stdDev = (values: number[]) => {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
};

const launchDirectionStdDev = (shots: ShotRecord[]) => {
  const values = shots
    .map((shot) => shot.launchDirectionDeg)
    .filter((value): value is number => typeof value === 'number');
  return stdDev(values);
};

const summarizeClubDeltas = (club: string, improved: DeltaEntry[], regressed: DeltaEntry[]) => {
  const topImproved = [...improved].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
  const topRegressed = [...regressed].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];

  if (!topImproved && !topRegressed) return `No comparable deltas for ${club}.`;
  if (topImproved && !topRegressed) {
    return `Best change: ${topImproved.metric} improved by ${Math.abs(topImproved.delta).toFixed(2)}${topImproved.unit}.`;
  }
  if (!topImproved && topRegressed) {
    return `Biggest regression: ${topRegressed.metric} changed by ${Math.abs(topRegressed.delta).toFixed(2)}${topRegressed.unit}.`;
  }
  return `Improved ${topImproved?.metric} by ${Math.abs(topImproved?.delta ?? 0).toFixed(2)}${topImproved?.unit}; regressed ${topRegressed?.metric} by ${Math.abs(topRegressed?.delta ?? 0).toFixed(2)}${topRegressed?.unit}.`;
};

const toHeadline = (prefix: string, entry: DeltaEntry) => {
  const sign = entry.delta > 0 ? '+' : '';
  return `${prefix} ${entry.metric}: ${entry.previous.toFixed(2)} -> ${entry.current.toFixed(2)} (${sign}${entry.delta.toFixed(2)}${entry.unit})`;
};

const inferLikelyCause = (
  prevShots: ShotRecord[],
  currentShots: ShotRecord[],
  prevStats: ReturnType<typeof computeStats>,
  currentStats: ReturnType<typeof computeStats>
) => {
  const prevOffline = prevStats.overallStats.offlineStdDev;
  const currentOffline = currentStats.overallStats.offlineStdDev;
  const prevFaceToPathStd = prevStats.overallStats.faceToPathStdDev;
  const currentFaceToPathStd = currentStats.overallStats.faceToPathStdDev;
  const prevCarryStd = prevStats.overallStats.carryStdDev;
  const currentCarryStd = currentStats.overallStats.carryStdDev;
  const prevSmashStd = prevStats.overallStats.smashStdDev;
  const currentSmashStd = currentStats.overallStats.smashStdDev;
  const prevLaunchStd = launchDirectionStdDev(prevShots);
  const currentLaunchStd = launchDirectionStdDev(currentShots);

  const offlineWorse =
    prevOffline !== null && currentOffline !== null && currentOffline > prevOffline;
  const faceStdWorse =
    prevFaceToPathStd !== null && currentFaceToPathStd !== null && currentFaceToPathStd > prevFaceToPathStd;
  const carryStdWorse =
    prevCarryStd !== null && currentCarryStd !== null && currentCarryStd > prevCarryStd;
  const smashStdWorse =
    prevSmashStd !== null && currentSmashStd !== null && currentSmashStd > prevSmashStd;
  const launchStdWorse =
    prevLaunchStd !== null && currentLaunchStd !== null && currentLaunchStd > prevLaunchStd;
  const smashStable =
    prevSmashStd !== null && currentSmashStd !== null && Math.abs(currentSmashStd - prevSmashStd) <= 0.02;

  if (offlineWorse && faceStdWorse) {
    return {
      type: 'face' as const,
      explanation: `Offline std dev increased (${prevOffline?.toFixed(1)} -> ${currentOffline?.toFixed(1)} yds) while face-to-path std dev also worsened (${prevFaceToPathStd?.toFixed(2)} -> ${currentFaceToPathStd?.toFixed(2)} deg).`
    };
  }

  if (carryStdWorse && smashStdWorse) {
    return {
      type: 'strike' as const,
      explanation: `Carry std dev worsened (${prevCarryStd?.toFixed(1)} -> ${currentCarryStd?.toFixed(1)} yds) alongside smash std dev (${prevSmashStd?.toFixed(2)} -> ${currentSmashStd?.toFixed(2)}).`
    };
  }

  if (launchStdWorse && smashStable) {
    return {
      type: 'path' as const,
      explanation: `Launch-direction variance worsened (${prevLaunchStd?.toFixed(2)} -> ${currentLaunchStd?.toFixed(2)} deg) while smash variability stayed stable.`
    };
  }

  return {
    type: 'variance' as const,
    explanation: 'No dominant single-cause pattern was detected from available deltas.'
  };
};

export function compareSessions(prev: ComparableSession | null, current: ComparableSession): SessionComparison {
  if (!prev) {
    return {
      comparedToSessionId: null,
      overall: { improved: [], regressed: [] },
      clubs: {},
      headlines: ['No previous session available for deterministic comparison.'],
      likelyCause: {
        type: 'variance',
        explanation: 'Need at least one prior session to compute deterministic change signals.'
      }
    };
  }

  const prevStats = computeStats(toNormalizedShotsFromShotRecords(prev.shots));
  const currentStats = computeStats(toNormalizedShotsFromShotRecords(current.shots));

  const overallImproved: DeltaEntry[] = [];
  const overallRegressed: DeltaEntry[] = [];

  addDelta(overallImproved, overallRegressed, 'shotCount', prevStats.overallStats.count, currentStats.overallStats.count, '', 'higher_better');
  addDelta(overallImproved, overallRegressed, 'carryMedian', prevStats.overallStats.carryMedian, currentStats.overallStats.carryMedian, ' yds', 'higher_better');
  addDelta(overallImproved, overallRegressed, 'carryStdDev', prevStats.overallStats.carryStdDev, currentStats.overallStats.carryStdDev, ' yds', 'lower_better');
  addDelta(overallImproved, overallRegressed, 'offlineStdDev', prevStats.overallStats.offlineStdDev, currentStats.overallStats.offlineStdDev, ' yds', 'lower_better');

  const prevClubs = prevStats.perClubStats;
  const currentClubs = currentStats.perClubStats;
  const intersectingClubs = Object.keys(currentClubs).filter((club) => Boolean(prevClubs[club]));

  const clubs: Record<string, ClubDeltaGroup> = {};
  for (const club of intersectingClubs) {
    const previous = prevClubs[club];
    const next = currentClubs[club];
    const improved: DeltaEntry[] = [];
    const regressed: DeltaEntry[] = [];

    addDelta(improved, regressed, 'carryMedian', previous.carryMedian, next.carryMedian, ' yds', 'higher_better');
    addDelta(improved, regressed, 'carryStdDev', previous.carryStdDev, next.carryStdDev, ' yds', 'lower_better');
    addDelta(improved, regressed, 'offlineStdDev', previous.offlineStdDev, next.offlineStdDev, ' yds', 'lower_better');
    addDelta(improved, regressed, 'smashMedian', previous.smashMedian, next.smashMedian, '', 'higher_better');
    addDelta(improved, regressed, 'faceToPathMean', previous.faceToPathMean, next.faceToPathMean, ' deg', 'abs_zero_better');

    clubs[club] = {
      improved,
      regressed,
      keyDeltaSummary: summarizeClubDeltas(club, improved, regressed)
    };
  }

  const headlineCandidates = [
    ...overallImproved.map((entry) => ({ entry, prefix: 'Improved' })),
    ...overallRegressed.map((entry) => ({ entry, prefix: 'Regressed' }))
  ].sort((a, b) => Math.abs(b.entry.delta) - Math.abs(a.entry.delta));

  const headlines = headlineCandidates.slice(0, 3).map((item) => toHeadline(item.prefix, item.entry));
  if (!headlines.length) {
    headlines.push('No comparable numeric deltas available between these sessions.');
  }

  return {
    comparedToSessionId: prev.sessionId,
    overall: {
      improved: overallImproved,
      regressed: overallRegressed
    },
    clubs,
    headlines,
    likelyCause: inferLikelyCause(prev.shots, current.shots, prevStats, currentStats)
  };
}
