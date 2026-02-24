import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

const createDrillLogSchema = z.object({
  shotSessionId: z.string().trim().min(1).optional(),
  constraintKey: z
    .enum(['direction_consistency', 'distance_control', 'bag_gapping', 'strike_quality'])
    .optional(),
  drillName: z.string().trim().min(2).max(120),
  durationMins: z.number().int().min(1).max(180).optional(),
  perceivedOutcome: z.number().int().min(1).max(5).optional(),
  notes: z.string().trim().max(500).optional()
});

export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limitRaw = Number(searchParams.get('limit') ?? 20);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 100) : 20;

  const logs = await prisma.drillLog.findMany({
    where: { userId },
    orderBy: { completedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      shotSessionId: true,
      constraintKey: true,
      drillName: true,
      durationMins: true,
      perceivedOutcome: true,
      notes: true,
      completedAt: true
    }
  });

  return NextResponse.json({ drillLogs: logs });
}

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = createDrillLogSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid drill log payload.' }, { status: 400 });
  }

  const shotSessionId = parsed.data.shotSessionId ?? null;
  if (shotSessionId) {
    const ownsSession = await prisma.shotSession.findFirst({
      where: { id: shotSessionId, userId },
      select: { id: true }
    });
    if (!ownsSession) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
    }
  }

  const saved = await prisma.drillLog.create({
    data: {
      userId,
      shotSessionId,
      constraintKey: parsed.data.constraintKey ?? null,
      drillName: parsed.data.drillName,
      durationMins: parsed.data.durationMins ?? null,
      perceivedOutcome: parsed.data.perceivedOutcome ?? null,
      notes: parsed.data.notes ?? null
    },
    select: {
      id: true,
      completedAt: true
    }
  });

  return NextResponse.json({ ok: true, drillLogId: saved.id, completedAt: saved.completedAt }, { status: 201 });
}
