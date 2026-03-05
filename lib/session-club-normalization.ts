import { getUserClubAliasMap } from '@/lib/club-aliases';
import { prisma } from '@/lib/prisma';
import { computeMissPatterns, computeStats, toNormalizedShotsFromShotRecords } from '@/lib/r10';
import { resolveClubNormalization } from '@/lib/club-normalization';
import { parseStoredSessionPayload, toShotRecords, type StoredSessionPayload } from '@/lib/session-storage';

const deriveStats = (payload: StoredSessionPayload) => {
  const shots = toShotRecords(payload.shots);
  const normalizedShots = toNormalizedShotsFromShotRecords(shots);
  const deterministic = computeStats(normalizedShots);
  const missPatterns = computeMissPatterns(normalizedShots);
  return {
    version: 1 as const,
    computedAt: new Date().toISOString(),
    perClubStats: Object.fromEntries(
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
    )
  };
};

const normalizePayloadClubs = (
  payload: StoredSessionPayload,
  aliasMap: Map<string, string>,
  forceRemap: boolean
): { nextPayload: StoredSessionPayload; changed: boolean } => {
  let changed = false;

  const shots = payload.shots.map((shot) => {
    const rawCandidate = shot.clubRaw?.trim() || shot.clubType?.trim() || 'Unknown';
    const resolved = resolveClubNormalization(rawCandidate, aliasMap);
    const existingNormalized = shot.clubNormalized?.trim() || shot.clubType?.trim() || 'Unknown';
    const nextNormalized = forceRemap ? resolved.clubNormalized : existingNormalized;
    const shouldSetNormalized =
      forceRemap ||
      !shot.clubNormalized ||
      !shot.clubRaw ||
      shot.clubType !== nextNormalized ||
      shot.displayClub !== (shot.clubName ? `${nextNormalized} (${shot.clubName})` : nextNormalized);

    if (!shouldSetNormalized) return shot;
    changed = true;
    return {
      ...shot,
      clubRaw: resolved.clubRaw,
      clubNormalized: nextNormalized,
      clubType: nextNormalized,
      displayClub: shot.clubName ? `${nextNormalized} (${shot.clubName})` : nextNormalized
    };
  });

  const nextPayload: StoredSessionPayload = {
    ...payload,
    version: Math.max(payload.version, 4),
    shots
  };

  if (changed || !payload.derivedStats || payload.derivedStats.version !== 1) {
    nextPayload.derivedStats = deriveStats(nextPayload);
    changed = true;
  }

  return { nextPayload, changed };
};

export async function backfillUserSessionsClubNormalization(userId: string, forceRemap = false) {
  const sessions = await prisma.shotSession.findMany({
    where: { userId },
    select: {
      id: true,
      notes: true
    }
  });

  const aliasMap = await getUserClubAliasMap(userId);
  let updated = 0;

  for (const session of sessions) {
    const payload = parseStoredSessionPayload(session.notes);
    if (!payload) continue;
    const { nextPayload, changed } = normalizePayloadClubs(payload, aliasMap, forceRemap);
    if (!changed) continue;
    await prisma.shotSession.update({
      where: { id: session.id },
      data: {
        notes: JSON.stringify(nextPayload)
      }
    });
    updated += 1;
  }

  return updated;
}
