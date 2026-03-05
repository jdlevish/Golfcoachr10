import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { buildRuleInsights, buildTrendDeltas } from '@/lib/analysis';
import { buildCoachV2Plan } from '@/lib/coach-v2';
import { prisma } from '@/lib/prisma';
import { buildCoachPlan, buildGappingLadder, summarizeSession } from '@/lib/r10';
import { compareSessions } from '@/lib/session-compare';
import { parseStoredSessionPayload, toShotRecords } from '@/lib/session-storage';
import { backfillUserSessionsClubNormalization } from '@/lib/session-club-normalization';

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
  await backfillUserSessionsClubNormalization(userId);

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
  const parsedSessionDate =
    payload.sessionDate && !Number.isNaN(new Date(payload.sessionDate).getTime())
      ? new Date(payload.sessionDate)
      : null;
  const effectiveDate = parsedSessionDate ?? entry.importedAt;
  const summary = summarizeSession(shots);
  const gappingLadder = buildGappingLadder(summary);
  const coachPlan = buildCoachPlan(summary, gappingLadder);
  const coachV2Plan = buildCoachV2Plan(summary, gappingLadder, { sessionsAnalyzed: 1, shots });
  const peerSessions = await prisma.shotSession.findMany({
    where: {
      userId,
      id: { not: entry.id }
    },
    orderBy: { importedAt: 'desc' },
    select: {
      id: true,
      importedAt: true,
      notes: true
    }
  });
  const effectiveDateFor = (sessionDate: string | undefined, fallback: Date) =>
    sessionDate && !Number.isNaN(new Date(sessionDate).getTime()) ? new Date(sessionDate) : fallback;
  const previousSessionCandidate = peerSessions
    .map((session) => {
      const parsed = parseStoredSessionPayload(session.notes);
      if (!parsed) return null;
      return {
        id: session.id,
        date: effectiveDateFor(parsed.sessionDate, session.importedAt),
        shots: toShotRecords(parsed.shots)
      };
    })
    .filter((session): session is NonNullable<typeof session> => session !== null)
    .filter((session) => session.date < effectiveDate)
    .sort((a, b) => b.date.getTime() - a.date.getTime())[0] ?? null;
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
  const comparison = compareSessions(
    previousSessionCandidate
      ? {
          sessionId: previousSessionCandidate.id,
          shots: previousSessionCandidate.shots
        }
      : null,
    {
      sessionId: entry.id,
      shots
    }
  );

  return NextResponse.json({
    id: entry.id,
    sourceFile: entry.sourceFile,
    sessionDate: effectiveDate.toISOString(),
    importedAt: entry.importedAt,
    shots,
    summary,
    gappingLadder,
    coachPlan,
    coachV2Plan,
    trendDeltas,
    ruleInsights,
    comparison
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessionId = context.params.sessionId;
  const deleted = await prisma.shotSession.deleteMany({
    where: {
      id: sessionId,
      userId
    }
  });

  if (deleted.count === 0) {
    return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
