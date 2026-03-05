import { prisma } from '@/lib/prisma';
import { computeStats, toNormalizedShotsFromShotRecords } from '@/lib/r10';
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
};

const normalizeClubToken = (club: string) => {
  const cleaned = club.trim().toLowerCase().replace(/\s+/g, ' ');
  const shortIronMatch = cleaned.match(/^(\d+)i$/);
  if (shortIronMatch) return `${shortIronMatch[1]} iron`;
  const spacedShortIronMatch = cleaned.match(/^(\d+)\s+i$/);
  if (spacedShortIronMatch) return `${spacedShortIronMatch[1]} iron`;
  if (cleaned === 'pw') return 'pitching wedge';
  if (cleaned === 'sw') return 'sand wedge';
  if (cleaned === 'gw') return 'gap wedge';
  if (cleaned === 'lw') return 'lob wedge';
  return cleaned;
};

const deriveStatsFromPayload = (payload: StoredSessionPayload): StoredDerivedStats => {
  const shots = toShotRecords(payload.shots);
  const deterministic = computeStats(toNormalizedShotsFromShotRecords(shots));
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
        confidence: stats.confidence
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
  range: number
): Promise<ClubTrendPoint[]> {
  const normalizedClub = normalizeClubToken(clubNormalized);
  const safeRange = Number.isFinite(range) && range > 0 ? Math.floor(range) : 12;

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
    .slice(0, safeRange);

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
      faceToPathMean: stats.faceToPathMean
    });
  }

  return series;
}
