import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { parseStoredSessionPayload, toShotRecords, storedShotSchema } from '@/lib/session-storage';
import { summarizeSession } from '@/lib/r10';

const createSessionSchema = z.object({
  sourceFile: z.string().trim().min(1).max(255).optional(),
  shots: z.array(storedShotSchema).min(1)
});

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = createSessionSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid session payload.' }, { status: 400 });
  }

  const saved = await prisma.shotSession.create({
    data: {
      userId,
      sourceFile: parsed.data.sourceFile ?? null,
      notes: JSON.stringify({
        version: 1,
        shots: parsed.data.shots
      })
    },
    select: {
      id: true,
      importedAt: true
    }
  });

  return NextResponse.json({ ok: true, sessionId: saved.id, importedAt: saved.importedAt }, { status: 201 });
}

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
      sourceFile: true,
      importedAt: true,
      notes: true
    }
  });

  const items = sessions.map((entry) => {
    const payload = parseStoredSessionPayload(entry.notes);
    const summary = payload ? summarizeSession(toShotRecords(payload.shots)) : null;

    return {
      id: entry.id,
      sourceFile: entry.sourceFile,
      importedAt: entry.importedAt,
      shots: summary?.shots ?? 0,
      avgCarryYds: summary?.avgCarryYds ?? null,
      avgBallSpeedMph: summary?.avgBallSpeedMph ?? null,
      clubs: summary?.clubs.length ?? 0
    };
  });

  return NextResponse.json({ sessions: items });
}
