import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { buildRuleInsights, buildTrendDeltas } from '@/lib/analysis';
import { buildCoachV2Plan } from '@/lib/coach-v2';
import { generateCoachSummary } from '@/lib/coach-summary';
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
    where: { id: sessionId, userId },
    select: { id: true, notes: true }
  });
  if (!targetSession) {
    return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  }

  const parsed = parseStoredSessionPayload(targetSession.notes);
  if (!parsed) {
    return NextResponse.json({ error: 'Session data is unavailable.' }, { status: 422 });
  }

  const shots = toShotRecords(parsed.shots);
  const summary = summarizeSession(shots);
  const ladder = buildGappingLadder(summary);
  const coachV2Plan = buildCoachV2Plan(summary, ladder, { sessionsAnalyzed: 1 });
  if (!coachV2Plan) {
    return NextResponse.json({ error: 'Could not generate coach plan.' }, { status: 422 });
  }

  const profile = await prisma.coachProfile.findUnique({
    where: { userId },
    select: { tone: true, detailLevel: true }
  });

  const peerSessions = await prisma.shotSession.findMany({
    where: { userId, id: { not: targetSession.id } },
    orderBy: { importedAt: 'desc' },
    select: { notes: true }
  });
  const parsedPeers = peerSessions
    .map((entry) => {
      const payload = parseStoredSessionPayload(entry.notes);
      return payload ? toShotRecords(payload.shots) : null;
    })
    .filter((entry): entry is ReturnType<typeof toShotRecords> => entry !== null);
  const baselineShots = parsedPeers.flat();
  const baselineSummary = baselineShots.length ? summarizeSession(baselineShots) : null;
  const trendDeltas = buildTrendDeltas(
    summary,
    ladder,
    1,
    baselineSummary,
    baselineSummary ? parsedPeers.length : 0
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
  const ruleInsights = buildRuleInsights(shots, summary, ladder, drillLogs);

  const summaryResult = await generateCoachSummary({
    tone: profile?.tone ?? 'encouraging',
    detailLevel: profile?.detailLevel ?? 'balanced',
    primaryConstraint: coachV2Plan.primaryConstraint.label,
    secondaryConstraint: coachV2Plan.secondaryConstraint?.label ?? null,
    confidence: {
      level: coachV2Plan.confidence.level,
      score: coachV2Plan.confidence.score
    },
    target: coachV2Plan.practicePlan.goal,
    trendSummary: trendDeltas.summary,
    topInsights: ruleInsights.slice(0, 3).map((insight) => ({
      title: insight.title,
      ifThen: insight.ifThen,
      evidence: insight.evidence,
      action: insight.action
    }))
  });

  return NextResponse.json({
    summary: summaryResult.summary,
    source: summaryResult.source,
    model: summaryResult.model ?? null
  });
}
