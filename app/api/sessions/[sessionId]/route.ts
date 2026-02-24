import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { buildRuleInsights, buildTrendDeltas } from '@/lib/analysis';
import { buildCoachV2Plan } from '@/lib/coach-v2';
import { prisma } from '@/lib/prisma';
import { buildCoachPlan, buildGappingLadder, summarizeSession } from '@/lib/r10';
import { parseStoredSessionPayload, toShotRecords } from '@/lib/session-storage';

type RouteContext = {
  params: {
    sessionId: string;
  };
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessionId = context.params.sessionId;
  const entry = await prisma.shotSession.findFirst({
    where: {
      id: sessionId,
      userId
    },
    select: {
      id: true,
      sourceFile: true,
      importedAt: true,
      notes: true
    }
  });

  if (!entry) {
    return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  }

  const payload = parseStoredSessionPayload(entry.notes);
  if (!payload) {
    return NextResponse.json({ error: 'Session data is unavailable.' }, { status: 422 });
  }

  const shots = toShotRecords(payload.shots);
  const summary = summarizeSession(shots);
  const gappingLadder = buildGappingLadder(summary);
  const coachPlan = buildCoachPlan(summary, gappingLadder);
  const coachV2Plan = buildCoachV2Plan(summary, gappingLadder, { sessionsAnalyzed: 1 });
  const peerSessions = await prisma.shotSession.findMany({
    where: {
      userId,
      id: { not: entry.id }
    },
    orderBy: { importedAt: 'desc' },
    select: {
      id: true,
      notes: true
    }
  });
  const parsedPeerSessions = peerSessions
    .map((session) => {
      const payload = parseStoredSessionPayload(session.notes);
      return payload ? toShotRecords(payload.shots) : null;
    })
    .filter((sessionShots): sessionShots is ReturnType<typeof toShotRecords> => sessionShots !== null);
  const baselineShots = parsedPeerSessions.flat();
  const baselineSummary = baselineShots.length ? summarizeSession(baselineShots) : null;
  const trendDeltas = buildTrendDeltas(
    summary,
    gappingLadder,
    1,
    baselineSummary,
    baselineSummary ? parsedPeerSessions.length : 0
  );
  const ruleInsights = buildRuleInsights(shots, summary, gappingLadder);

  return NextResponse.json({
    id: entry.id,
    sourceFile: entry.sourceFile,
    importedAt: entry.importedAt,
    shots,
    summary,
    gappingLadder,
    coachPlan,
    coachV2Plan,
    trendDeltas,
    ruleInsights
  });
}
