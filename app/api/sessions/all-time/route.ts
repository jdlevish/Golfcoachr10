import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { buildRuleInsights, buildTrendDeltas } from '@/lib/analysis';
import { prisma } from '@/lib/prisma';
import { buildCoachV2Plan } from '@/lib/coach-v2';
import { buildCoachPlan, buildGappingLadder, summarizeSession } from '@/lib/r10';
import { parseStoredSessionPayload, toShotRecords } from '@/lib/session-storage';
import { backfillUserSessionsClubNormalization } from '@/lib/session-club-normalization';

type TimeWindow = 'all' | '1w' | '1m' | '3m' | '9m' | '1y';

type ParsedSession = {
  id: string;
  importedAt: Date;
  shots: ReturnType<typeof toShotRecords>;
  summary: ReturnType<typeof summarizeSession>;
  gappingLadder: ReturnType<typeof buildGappingLadder>;
};

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

const windowDays = (window: TimeWindow): number | null => {
  if (window === '1w') return 7;
  if (window === '1m') return 30;
  if (window === '3m') return 90;
  if (window === '9m') return 270;
  if (window === '1y') return 365;
  return null;
};

const avg = (values: number[]) => {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const buildPeriodComparison = (sessions: ParsedSession[], window: TimeWindow) => {
  const days = windowDays(window);
  if (!days) return null;

  const now = new Date();
  const currentStart = new Date(now);
  currentStart.setDate(now.getDate() - days);
  const previousStart = new Date(currentStart);
  previousStart.setDate(currentStart.getDate() - days);

  const currentPeriodSessions = sessions.filter((session) => session.importedAt >= currentStart);
  const previousPeriodSessions = sessions.filter(
    (session) => session.importedAt >= previousStart && session.importedAt < currentStart
  );

  const currentAvgShots = avg(currentPeriodSessions.map((session) => session.summary.shots));
  const previousAvgShots = avg(previousPeriodSessions.map((session) => session.summary.shots));

  const aggregateClubMetric = (
    periodSessions: ParsedSession[],
    metric: 'medianCarryYds' | 'offlineStdDevYds'
  ) => {
    const bucket = new Map<string, number[]>();
    for (const session of periodSessions) {
      for (const club of session.summary.clubs) {
        const value = club[metric];
        if (typeof value !== 'number') continue;
        const list = bucket.get(club.clubType) ?? [];
        list.push(value);
        bucket.set(club.clubType, list);
      }
    }
    return new Map(
      Array.from(bucket.entries()).map(([club, values]) => [club, avg(values)])
    );
  };

  const currentCarry = aggregateClubMetric(currentPeriodSessions, 'medianCarryYds');
  const previousCarry = aggregateClubMetric(previousPeriodSessions, 'medianCarryYds');
  const currentOffline = aggregateClubMetric(currentPeriodSessions, 'offlineStdDevYds');
  const previousOffline = aggregateClubMetric(previousPeriodSessions, 'offlineStdDevYds');

  const sharedClubs = Array.from(currentCarry.keys()).filter(
    (club) => previousCarry.has(club) && currentOffline.has(club) && previousOffline.has(club)
  );

  const clubs = sharedClubs.map((club) => {
    const currentCarryValue = currentCarry.get(club) ?? null;
    const previousCarryValue = previousCarry.get(club) ?? null;
    const currentOfflineValue = currentOffline.get(club) ?? null;
    const previousOfflineValue = previousOffline.get(club) ?? null;
    return {
      club,
      carryMedianChange: {
        previous: previousCarryValue,
        current: currentCarryValue,
        delta:
          previousCarryValue === null || currentCarryValue === null
            ? null
            : currentCarryValue - previousCarryValue
      },
      offlineStdDevChange: {
        previous: previousOfflineValue,
        current: currentOfflineValue,
        delta:
          previousOfflineValue === null || currentOfflineValue === null
            ? null
            : currentOfflineValue - previousOfflineValue
      }
    };
  });

  const sessionFrequencyDelta = currentPeriodSessions.length - previousPeriodSessions.length;
  const sessionFrequencyDeltaPct =
    previousPeriodSessions.length > 0
      ? (sessionFrequencyDelta / previousPeriodSessions.length) * 100
      : null;
  const avgShotCountDelta =
    previousAvgShots !== null && currentAvgShots !== null ? currentAvgShots - previousAvgShots : null;
  const avgShotCountDeltaPct =
    previousAvgShots && avgShotCountDelta !== null ? (avgShotCountDelta / previousAvgShots) * 100 : null;

  return {
    range: window,
    currentPeriod: {
      from: currentStart.toISOString(),
      to: now.toISOString(),
      sessions: currentPeriodSessions.length,
      avgShotCount: currentAvgShots
    },
    previousPeriod: {
      from: previousStart.toISOString(),
      to: currentStart.toISOString(),
      sessions: previousPeriodSessions.length,
      avgShotCount: previousAvgShots
    },
    sessionFrequencyChange: {
      previous: previousPeriodSessions.length,
      current: currentPeriodSessions.length,
      delta: sessionFrequencyDelta,
      deltaPct: sessionFrequencyDeltaPct
    },
    avgShotCountChange: {
      previous: previousAvgShots,
      current: currentAvgShots,
      delta: avgShotCountDelta,
      deltaPct: avgShotCountDeltaPct
    },
    clubs
  };
};

export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await backfillUserSessionsClubNormalization(userId);

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

  const parsedSessionsAll = sessions
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
    .sort((a, b) => b.importedAt.getTime() - a.importedAt.getTime());
  const parsedSessions = parsedSessionsAll.filter((entry) => (windowStart ? entry.importedAt >= windowStart : true));
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
    sessionsAnalyzed: parsedSessions.length,
    shots: allShots
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
  const periodComparison = buildPeriodComparison(parsedSessionsAll, timeWindow);

  return NextResponse.json({
    timeWindow,
    sessionsCount: parsedSessions.length,
    summary,
    gappingLadder,
    coachPlan,
    coachV2Plan,
    trendDeltas,
    ruleInsights,
    periodComparison
  });
}
