import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { buildRuleInsights, buildTrendDeltas } from '@/lib/analysis';
import { prisma } from '@/lib/prisma';
import { buildCoachV2Plan } from '@/lib/coach-v2';
import { buildCoachPlan, buildGappingLadder, summarizeSession } from '@/lib/r10';
import { parseStoredSessionPayload, toShotRecords } from '@/lib/session-storage';

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessions = await prisma.shotSession.findMany({
    where: { userId },
    orderBy: { importedAt: 'desc' },
    select: {
      id: true,
      importedAt: true,
      notes: true
    }
  });

  const parsedSessions = sessions
    .map((entry) => {
      const payload = parseStoredSessionPayload(entry.notes);
      if (!payload) return null;
      const shots = toShotRecords(payload.shots);
      const summary = summarizeSession(shots);
      const gappingLadder = buildGappingLadder(summary);
      return {
        id: entry.id,
        importedAt: entry.importedAt,
        shots,
        summary,
        gappingLadder
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const allShots = parsedSessions.flatMap((entry) => {
    return entry.shots;
  });

  const summary = summarizeSession(allShots);
  const gappingLadder = buildGappingLadder(summary);
  const coachPlan = buildCoachPlan(summary, gappingLadder);
  const coachV2Plan = buildCoachV2Plan(summary, gappingLadder, {
    sessionsAnalyzed: parsedSessions.length
  });
  const latestSession = parsedSessions[0] ?? null;
  const baselineSessions = parsedSessions.slice(1);
  const baselineSummary = summarizeSession(baselineSessions.flatMap((entry) => entry.shots));
  const trendDeltas = latestSession
    ? buildTrendDeltas(
        latestSession.summary,
        latestSession.gappingLadder,
        parsedSessions.length,
        baselineSessions.length > 0 ? baselineSummary : null,
        baselineSessions.length
      )
    : null;
  const ruleInsights = latestSession
    ? buildRuleInsights(latestSession.shots, latestSession.summary, latestSession.gappingLadder)
    : [];

  return NextResponse.json({
    sessionsCount: sessions.length,
    summary,
    gappingLadder,
    coachPlan,
    coachV2Plan,
    trendDeltas,
    ruleInsights
  });
}
