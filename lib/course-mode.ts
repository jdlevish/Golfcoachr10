import { prisma } from '@/lib/prisma';
import { parseStoredSessionPayload } from '@/lib/session-storage';
import { backfillUserSessionsClubNormalization } from '@/lib/session-club-normalization';

export type CourseLie = 'fairway' | 'rough';
export type WindDirection = 'none' | 'headwind' | 'tailwind';

export type CourseModeInput = {
  targetCarry: number;
  windDirection: WindDirection;
  windMph: number;
  lie: CourseLie;
};

export type CourseModeClubRecommendation = {
  club: string;
  carryMedian: number;
  carryStdDev: number | null;
  offlineStdDev: number | null;
  confidence: 'High' | 'Medium' | 'Low';
  sessionsUsed: number;
  trendHref: string;
};

export type CourseModeResult = {
  adjustedTargetCarry: number;
  recommended: CourseModeClubRecommendation;
  oneUp: CourseModeClubRecommendation | null;
  oneDown: CourseModeClubRecommendation | null;
  candidates: number;
  excludedLowConfidence: number;
};

type ClubPoint = {
  date: Date;
  carryMedian: number;
  carryStdDev: number | null;
  offlineStdDev: number | null;
};

const mean = (values: Array<number | null>) => {
  const numeric = values.filter((value): value is number => typeof value === 'number');
  if (!numeric.length) return null;
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
};

const baseConfidence = (carryStdDev: number | null, offlineStdDev: number | null, sessionsUsed: number) => {
  if (carryStdDev === null && offlineStdDev === null) {
    return sessionsUsed >= 4 ? ('Medium' as const) : ('Low' as const);
  }
  if (carryStdDev === null) {
    if (offlineStdDev !== null && offlineStdDev < 18 && sessionsUsed >= 3) return 'Medium' as const;
    return 'Low' as const;
  }
  if (offlineStdDev === null) {
    if (carryStdDev < 9 && sessionsUsed >= 3) return 'Medium' as const;
    return 'Low' as const;
  }
  if (carryStdDev < 6 && offlineStdDev < 12) return 'High' as const;
  if (carryStdDev < 9 && offlineStdDev < 18) return 'Medium' as const;
  return 'Low' as const;
};

const applyLiePenalty = (confidence: 'High' | 'Medium' | 'Low', lie: CourseLie) => {
  if (lie !== 'rough') return confidence;
  if (confidence === 'High') return 'Medium' as const;
  if (confidence === 'Medium') return 'Low' as const;
  return 'Low' as const;
};

const adjustTargetForWind = (targetCarry: number, windDirection: WindDirection, windMph: number) => {
  if (windDirection === 'none' || windMph <= 0) return targetCarry;
  const adjustment = windMph * 0.6;
  if (windDirection === 'headwind') return targetCarry + adjustment;
  return targetCarry - adjustment;
};

export async function getCourseModeRecommendation(
  userId: string,
  input: CourseModeInput
): Promise<CourseModeResult | null> {
  await backfillUserSessionsClubNormalization(userId);

  const sessions = await prisma.shotSession.findMany({
    where: { userId },
    select: {
      importedAt: true,
      notes: true
    }
  });

  const byClub = new Map<string, ClubPoint[]>();
  for (const session of sessions) {
    const payload = parseStoredSessionPayload(session.notes);
    if (!payload?.derivedStats?.perClubStats) continue;
    const sessionDate =
      payload.sessionDate && !Number.isNaN(new Date(payload.sessionDate).getTime())
        ? new Date(payload.sessionDate)
        : session.importedAt;

    for (const [club, stats] of Object.entries(payload.derivedStats.perClubStats)) {
      if (typeof stats.carryMedian !== 'number') continue;
      const existing = byClub.get(club) ?? [];
      existing.push({
        date: sessionDate,
        carryMedian: stats.carryMedian,
        carryStdDev: stats.carryStdDev,
        offlineStdDev: stats.offlineStdDev
      });
      byClub.set(club, existing);
    }
  }

  const adjustedTargetCarry = adjustTargetForWind(input.targetCarry, input.windDirection, input.windMph);
  const buildRanked = (useFallbackWindow: boolean) =>
    Array.from(byClub.entries())
      .map(([club, points]) => {
        const sorted = [...points].sort((a, b) => b.date.getTime() - a.date.getTime());
        const selected = useFallbackWindow
          ? sorted.slice(0, Math.min(5, sorted.length))
          : sorted.length >= 5
            ? sorted.slice(0, 5)
            : sorted.slice(0, 1);
        const carryMedian = mean(selected.map((point) => point.carryMedian));
        if (carryMedian === null) return null;
        const carryStdDev = mean(selected.map((point) => point.carryStdDev));
        const offlineStdDev = mean(selected.map((point) => point.offlineStdDev));
        const confidence = applyLiePenalty(baseConfidence(carryStdDev, offlineStdDev, selected.length), input.lie);
        return {
          club,
          carryMedian,
          carryStdDev,
          offlineStdDev,
          confidence,
          sessionsUsed: selected.length,
          trendHref: `/trends?club=${encodeURIComponent(club)}`
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  let ranked = buildRanked(false);
  let eligible = ranked.filter((entry) => entry.confidence !== 'Low');
  if (!eligible.length) {
    ranked = buildRanked(true);
    eligible = ranked.filter((entry) => entry.confidence !== 'Low');
  }
  if (!eligible.length) return null;

  const best = [...eligible].sort(
    (a, b) => Math.abs(a.carryMedian - adjustedTargetCarry) - Math.abs(b.carryMedian - adjustedTargetCarry)
  )[0];
  const byCarry = [...eligible].sort((a, b) => b.carryMedian - a.carryMedian);
  const idx = byCarry.findIndex((entry) => entry.club === best.club);

  return {
    adjustedTargetCarry: Math.round(adjustedTargetCarry * 10) / 10,
    recommended: best,
    oneUp: idx > 0 ? byCarry[idx - 1] : null,
    oneDown: idx >= 0 && idx < byCarry.length - 1 ? byCarry[idx + 1] : null,
    candidates: eligible.length,
    excludedLowConfidence: ranked.length - eligible.length
  };
}
