import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { buildRuleInsights, buildTrendDeltas } from '@/lib/analysis';
import { buildCoachV2Plan } from '@/lib/coach-v2';
import { prisma } from '@/lib/prisma';
import { buildGappingLadder, summarizeSession } from '@/lib/r10';
import { parseStoredSessionPayload, toShotRecords } from '@/lib/session-storage';

type RouteContext = {
  params: {
    sessionId: string;
  };
};

export async function POST(_request: Request, context: RouteContext) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessionId = context.params.sessionId;
  const targetSession = await prisma.shotSession.findFirst({
    where: {
      id: sessionId,
      userId
    },
    select: {
      id: true,
      notes: true
    }
  });

  if (!targetSession) {
    return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  }

  const payload = parseStoredSessionPayload(targetSession.notes);
  if (!payload) {
    return NextResponse.json({ error: 'Session data is unavailable.' }, { status: 422 });
  }

  const shots = toShotRecords(payload.shots);
  const summary = summarizeSession(shots);
  const gappingLadder = buildGappingLadder(summary);
  const coachV2Plan = buildCoachV2Plan(summary, gappingLadder, { sessionsAnalyzed: 1 });
  const peerSessions = await prisma.shotSession.findMany({
    where: {
      userId,
      id: { not: targetSession.id }
    },
    orderBy: { importedAt: 'desc' },
    select: {
      notes: true
    }
  });
  const parsedPeerSessions = peerSessions
    .map((entry) => {
      const parsed = parseStoredSessionPayload(entry.notes);
      return parsed ? toShotRecords(parsed.shots) : null;
    })
    .filter((entry): entry is ReturnType<typeof toShotRecords> => entry !== null);
  const baselineShots = parsedPeerSessions.flat();
  const baselineSummary = baselineShots.length ? summarizeSession(baselineShots) : null;
  const trendDeltas = buildTrendDeltas(
    summary,
    gappingLadder,
    1,
    baselineSummary,
    baselineSummary ? parsedPeerSessions.length : 0
  );
  const drillLogs = await prisma.drillLog.findMany({
    where: { userId },
    orderBy: { completedAt: 'desc' },
    take: 50,
    select: {
      constraintKey: true,
      drillName: true,
      perceivedOutcome: true,
      completedAt: true
    }
  });
  const ruleInsights = buildRuleInsights(shots, summary, gappingLadder, drillLogs);

  if (!coachV2Plan) {
    return NextResponse.json({ error: 'Could not generate analysis.' }, { status: 422 });
  }

  const analysis = await prisma.sessionAnalysis.upsert({
    where: { shotSessionId: targetSession.id },
    create: {
      userId,
      shotSessionId: targetSession.id,
      coachPlanV2: coachV2Plan,
      trendDeltas,
      ruleInsights
    },
    update: {
      coachPlanV2: coachV2Plan,
      trendDeltas,
      ruleInsights
    },
    select: {
      id: true,
      updatedAt: true
    }
  });

  return NextResponse.json({
    ok: true,
    analysisId: analysis.id,
    updatedAt: analysis.updatedAt,
    coachV2Plan,
    trendDeltas,
    ruleInsights
  });
}
