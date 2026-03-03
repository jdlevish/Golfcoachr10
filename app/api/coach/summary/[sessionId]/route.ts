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

const round2 = (value: number) => Math.round(value * 100) / 100;

const stdDev = (values: number[]) => {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
};

const metricSummaryFromShots = (shots: ReturnType<typeof toShotRecords>) => {
  const metricMap: Array<{ key: string; values: number[] }> = [
    { key: 'ballSpeedMph', values: shots.map((shot) => shot.ballSpeedMph).filter((v): v is number => v !== null) },
    { key: 'clubSpeedMph', values: shots.map((shot) => shot.clubSpeedMph).filter((v): v is number => v !== null) },
    { key: 'smashFactor', values: shots.map((shot) => shot.smashFactor).filter((v): v is number => v !== null) },
    { key: 'carryYds', values: shots.map((shot) => shot.carryYds).filter((v): v is number => v !== null) },
    { key: 'totalYds', values: shots.map((shot) => shot.totalYds).filter((v): v is number => v !== null) },
    { key: 'launchAngleDeg', values: shots.map((shot) => shot.launchAngleDeg).filter((v): v is number => v !== null) },
    {
      key: 'launchDirectionDeg',
      values: shots.map((shot) => shot.launchDirectionDeg).filter((v): v is number => v !== null)
    },
    { key: 'clubPathDeg', values: shots.map((shot) => shot.clubPathDeg).filter((v): v is number => v !== null) },
    {
      key: 'faceToPathDeg',
      values: shots.map((shot) => shot.faceToPathDeg).filter((v): v is number => v !== null)
    },
    { key: 'faceAngleDeg', values: shots.map((shot) => shot.faceAngleDeg).filter((v): v is number => v !== null) },
    {
      key: 'attackAngleDeg',
      values: shots.map((shot) => shot.attackAngleDeg).filter((v): v is number => v !== null)
    },
    { key: 'spinRpm', values: shots.map((shot) => shot.spinRpm).filter((v): v is number => v !== null) },
    { key: 'backspinRpm', values: shots.map((shot) => shot.backspinRpm).filter((v): v is number => v !== null) },
    { key: 'sidespinRpm', values: shots.map((shot) => shot.sidespinRpm).filter((v): v is number => v !== null) },
    { key: 'spinAxisDeg', values: shots.map((shot) => shot.spinAxisDeg).filter((v): v is number => v !== null) },
    { key: 'apexFt', values: shots.map((shot) => shot.apexFt).filter((v): v is number => v !== null) },
    { key: 'sideYds', values: shots.map((shot) => shot.sideYds).filter((v): v is number => v !== null) }
  ];

  return metricMap
    .filter((metric) => metric.values.length > 0)
    .map((metric) => {
      const mean = metric.values.reduce((sum, value) => sum + value, 0) / metric.values.length;
      const sd = stdDev(metric.values);
      return {
        key: metric.key,
        samples: metric.values.length,
        avg: round2(mean),
        stdDev: sd === null ? null : round2(sd),
        min: round2(Math.min(...metric.values)),
        max: round2(Math.max(...metric.values))
      };
    });
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
  const coachV2Plan = buildCoachV2Plan(summary, ladder, { sessionsAnalyzed: 1, shots });
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
    topInsights: ruleInsights.slice(0, 6).map((insight) => ({
      title: insight.title,
      ifThen: insight.ifThen,
      evidence: insight.evidence,
      action: insight.action
    })),
    shotMetricSummary: metricSummaryFromShots(shots)
  });

  const existingRecommendations = await prisma.drillLog.findMany({
    where: {
      userId,
      shotSessionId: targetSession.id,
      recommendationSource: 'ai_summary'
    },
    select: {
      drillName: true,
      videoUrl: true
    }
  });
  const existingKey = new Set(
    existingRecommendations.map((item) => `${item.drillName.toLowerCase()}::${item.videoUrl ?? ''}`)
  );
  const inserts = summaryResult.recommendedDrills.filter((drill) => {
    const key = `${drill.name.toLowerCase()}::${drill.youtubeUrl}`;
    return !existingKey.has(key);
  });
  if (inserts.length > 0) {
    await prisma.drillLog.createMany({
      data: inserts.map((drill) => ({
        userId,
        shotSessionId: targetSession.id,
        constraintKey: coachV2Plan.primaryConstraint.key,
        drillName: drill.name,
        videoUrl: drill.youtubeUrl,
        recommendationSource: 'ai_summary',
        notes: `AI summary recommendation: ${drill.why}`
      }))
    });
  }

  return NextResponse.json({
    summary: summaryResult.summary,
    recommendedDrills: summaryResult.recommendedDrills,
    drillRecommendationsLogged: inserts.length,
    source: summaryResult.source,
    model: summaryResult.model ?? null
  });
}
