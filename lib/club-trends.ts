import { prisma } from '@/lib/prisma';
import { computeMissPatterns, computeStats, toNormalizedShotsFromShotRecords } from '@/lib/r10';
import { resolveClubNormalization } from '@/lib/club-normalization';
import {
  parseStoredSessionPayload,
  toShotRecords,
  type StoredDerivedStats,
  type StoredSessionPayload
} from '@/lib/session-storage';

export type ClubTrendPoint = {
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

export type ClubTrendRange = '7d' | '30d' | '90d' | '1y' | 'all';

export const normalizeClubToken = (club: string) => {
  return resolveClubNormalization(club, new Map()).clubNormalized;
};

const toRangeStart = (range: number | ClubTrendRange): Date | null => {
  if (typeof range === 'number') return null;
  if (range === 'all') return null;
  const now = new Date();
  const start = new Date(now);
  if (range === '7d') {
    start.setDate(now.getDate() - 7);
    return start;
  }
  if (range === '30d') {
    start.setDate(now.getDate() - 30);
    return start;
  }
  if (range === '90d') {
    start.setDate(now.getDate() - 90);
    return start;
  }
  start.setFullYear(now.getFullYear() - 1);
  return start;
};

const deriveStatsFromPayload = (payload: StoredSessionPayload): StoredDerivedStats => {
  const shots = toShotRecords(payload.shots);
  const normalizedShots = toNormalizedShotsFromShotRecords(shots);
  const deterministic = computeStats(normalizedShots);
  const missPatterns = computeMissPatterns(normalizedShots);
  const perClubStats = Object.fromEntries(
    Object.entries(deterministic.perClubStats).map(([club, stats]) => [
      club,
      {
        count: stats.count,
        carryMedian: stats.carryMedian,
        carryStdDev: stats.carryStdDev,
        offlineStdDev: stats.offlineStdDev,
        smashMedian: stats.smashMedian,
        faceToPathMean: stats.faceToPathMean,
        confidence: stats.confidence,
        topMissShape: missPatterns.perClub[club]?.topShape ?? null
      }
    ])
  );

  return {
    version: 1,
    computedAt: new Date().toISOString(),
    perClubStats
  };
};

const ensureDerivedStats = async (session: {
  id: string;
  userId: string;
  notes: string | null;
  importedAt: Date;
}) => {
  const payload = parseStoredSessionPayload(session.notes);
  if (!payload) return null;

  if (payload.derivedStats?.version === 1) {
    return {
      payload,
      derivedStats: payload.derivedStats
    };
  }

  const derivedStats = deriveStatsFromPayload(payload);
  const nextPayload: StoredSessionPayload = {
    ...payload,
    version: Math.max(payload.version, 3),
    derivedStats
  };

  await prisma.shotSession.update({
    where: { id: session.id },
    data: {
      notes: JSON.stringify(nextPayload)
    }
  });

  return {
    payload: nextPayload,
    derivedStats
  };
};

export async function getClubTrendSeries(
  userId: string,
  clubNormalized: string,
  range: number | ClubTrendRange
): Promise<ClubTrendPoint[]> {
  const normalizedClub = normalizeClubToken(clubNormalized);
  const safeRange = typeof range === 'number' && Number.isFinite(range) && range > 0 ? Math.floor(range) : 12;
  const rangeStart = toRangeStart(range);

  const sessions = await prisma.shotSession.findMany({
    where: { userId },
    select: {
      id: true,
      userId: true,
      importedAt: true,
      notes: true
    }
  });

  const sessionsWithDates = await Promise.all(
    sessions.map(async (session) => {
      const ensured = await ensureDerivedStats(session);
      if (!ensured) return null;
      const sessionDate =
        ensured.payload.sessionDate && !Number.isNaN(new Date(ensured.payload.sessionDate).getTime())
          ? new Date(ensured.payload.sessionDate)
          : session.importedAt;
      return {
        sessionId: session.id,
        date: sessionDate,
        derivedStats: ensured.derivedStats
      };
    })
  );

  const ordered = sessionsWithDates
    .filter((session): session is NonNullable<typeof session> => session !== null)
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .filter((session) => (rangeStart ? session.date >= rangeStart : true))
    .slice(0, typeof range === 'number' ? safeRange : Number.POSITIVE_INFINITY);

  const series: ClubTrendPoint[] = [];
  for (const session of ordered) {
    const matchingClubEntry = Object.entries(session.derivedStats.perClubStats).find(
      ([club]) => normalizeClubToken(club) === normalizedClub
    );
    if (!matchingClubEntry) continue;

    const [club, stats] = matchingClubEntry;
    series.push({
      sessionId: session.sessionId,
      date: session.date.toISOString(),
      club,
      carryMedian: stats.carryMedian,
      carryStdDev: stats.carryStdDev,
      offlineStdDev: stats.offlineStdDev,
      smashMedian: stats.smashMedian,
      faceToPathMean: stats.faceToPathMean,
      topMissShape: stats.topMissShape ?? null
    });
  }

  return series;
}

export async function getUserNormalizedClubs(userId: string): Promise<string[]> {
  const sessions = await prisma.shotSession.findMany({
    where: { userId },
    select: {
      id: true,
      userId: true,
      importedAt: true,
      notes: true
    }
  });

  const clubSet = new Set<string>();
  const ensured = await Promise.all(sessions.map((session) => ensureDerivedStats(session)));
  for (const entry of ensured) {
    if (!entry) continue;
    for (const club of Object.keys(entry.derivedStats.perClubStats)) {
      clubSet.add(normalizeClubToken(club));
    }
  }

  return Array.from(clubSet).sort((a, b) => a.localeCompare(b));
}
