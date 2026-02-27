import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { buildRuleInsights, buildTrendDeltas } from '@/lib/analysis';
import { prisma } from '@/lib/prisma';
import { buildCoachV2Plan } from '@/lib/coach-v2';
import { buildCoachPlan, buildGappingLadder, summarizeSession } from '@/lib/r10';
import { parseStoredSessionPayload, toShotRecords } from '@/lib/session-storage';

type TimeWindow = 'all' | '1w' | '1m' | '3m' | '9m' | '1y';

const resolveWindowStart = (window: TimeWindow): Date | null => {
  if (window === 'all') return null;

  const now = new Date();
  const start = new Date(now);

  if (window === '1w') {
    start.setDate(now.getDate() - 7);
    return start;
  }
  if (window === '1m') {
    start.setMonth(now.getMonth() - 1);
    return start;
  }
  if (window === '3m') {
    start.setMonth(now.getMonth() - 3);
    return start;
  }
  if (window === '9m') {
    start.setMonth(now.getMonth() - 9);
    return start;
  }

  start.setFullYear(now.getFullYear() - 1);
  return start;
};

export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const rawWindow = url.searchParams.get('window');
  const timeWindow: TimeWindow =
    rawWindow === '1w' || rawWindow === '1m' || rawWindow === '3m' || rawWindow === '9m' || rawWindow === '1y'
      ? rawWindow
      : 'all';
  const windowStart = resolveWindowStart(timeWindow);

  const sessions = await prisma.shotSession.findMany({
    where: {
      userId
    },
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
      const parsedSessionDate =
        payload.sessionDate && !Number.isNaN(new Date(payload.sessionDate).getTime())
          ? new Date(payload.sessionDate)
          : null;
      const effectiveDate = parsedSessionDate ?? entry.importedAt;
      return {
        id: entry.id,
        importedAt: effectiveDate,
        shots,
        summary,
        gappingLadder
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .filter((entry) => (windowStart ? entry.importedAt >= windowStart : true))
    .sort((a, b) => b.importedAt.getTime() - a.importedAt.getTime());
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
    ? buildRuleInsights(latestSession.shots, latestSession.summary, latestSession.gappingLadder, drillLogs)
    : [];

  return NextResponse.json({
    timeWindow,
    sessionsCount: sessions.length,
    summary,
    gappingLadder,
    coachPlan,
    coachV2Plan,
    trendDeltas,
    ruleInsights
  });
}
