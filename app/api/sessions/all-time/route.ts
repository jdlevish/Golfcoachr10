import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
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
      notes: true
    }
  });

  const allShots = sessions.flatMap((entry) => {
    const payload = parseStoredSessionPayload(entry.notes);
    return payload ? toShotRecords(payload.shots) : [];
  });

  const summary = summarizeSession(allShots);
  const gappingLadder = buildGappingLadder(summary);
  const coachPlan = buildCoachPlan(summary, gappingLadder);

  return NextResponse.json({
    sessionsCount: sessions.length,
    summary,
    gappingLadder,
    coachPlan
  });
}
