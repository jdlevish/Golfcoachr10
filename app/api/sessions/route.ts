import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { parseStoredSessionPayload, toShotRecords, storedShotSchema } from '@/lib/session-storage';
import { computeMissPatterns, computeStats, summarizeSession, toNormalizedShotsFromShotRecords } from '@/lib/r10';
import { getUserClubAliasMap } from '@/lib/club-aliases';
import { resolveClubNormalization } from '@/lib/club-normalization';
import { backfillUserSessionsClubNormalization } from '@/lib/session-club-normalization';

const createSessionSchema = z.object({
  sourceFile: z.string().trim().min(1).max(255).optional(),
  sessionDate: z.string().datetime().optional(),
  shots: z.array(storedShotSchema).min(1)
});

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = createSessionSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid session payload.' }, { status: 400 });
  }

  const aliasMap = await getUserClubAliasMap(userId);
  const normalizedStoredShots = parsed.data.shots.map((shot) => {
    const resolved = resolveClubNormalization(shot.clubRaw ?? shot.clubType, aliasMap);
    const clubNormalized = resolved.clubNormalized;
    return {
      ...shot,
      clubRaw: resolved.clubRaw,
      clubNormalized,
      clubType: clubNormalized,
      displayClub: shot.clubName ? `${clubNormalized} (${shot.clubName})` : clubNormalized
    };
  });

  const saved = await prisma.shotSession.create({
    data: (() => {
      const normalizedShots = toNormalizedShotsFromShotRecords(toShotRecords(normalizedStoredShots));
      const deterministic = computeStats(normalizedShots);
      const missPatterns = computeMissPatterns(normalizedShots);
      return {
        userId,
        sourceFile: parsed.data.sourceFile ?? null,
        notes: JSON.stringify({
          version: 3,
          sessionDate: parsed.data.sessionDate,
          derivedStats: {
            version: 1,
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
          },
          shots: normalizedStoredShots
        })
      };
    })(),
    select: {
      id: true,
      importedAt: true
    }
  });

  return NextResponse.json({ ok: true, sessionId: saved.id, importedAt: saved.importedAt }, { status: 201 });
}

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await backfillUserSessionsClubNormalization(userId);

  const sessions = await prisma.shotSession.findMany({
    where: { userId },
    select: {
      id: true,
      sourceFile: true,
      importedAt: true,
      notes: true
    }
  });

  const items = sessions.map((entry) => {
    const payload = parseStoredSessionPayload(entry.notes);
    const summary = payload ? summarizeSession(toShotRecords(payload.shots)) : null;
    const parsedSessionDate =
      payload?.sessionDate && !Number.isNaN(new Date(payload.sessionDate).getTime())
        ? new Date(payload.sessionDate)
        : null;
    const effectiveDate = parsedSessionDate ?? entry.importedAt;

    return {
      id: entry.id,
      sourceFile: entry.sourceFile,
      sessionDate: effectiveDate.toISOString(),
      importedAt: entry.importedAt,
      shots: summary?.shots ?? 0,
      avgCarryYds: summary?.avgCarryYds ?? null,
      avgBallSpeedMph: summary?.avgBallSpeedMph ?? null,
      clubs: summary?.clubs.length ?? 0
    };
  })
  .sort((a, b) => new Date(b.sessionDate).getTime() - new Date(a.sessionDate).getTime());

  return NextResponse.json({ sessions: items });
}
