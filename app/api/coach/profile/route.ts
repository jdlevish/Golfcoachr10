import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

const updateProfileSchema = z.object({
  tone: z.enum(['straight', 'encouraging', 'technical']),
  detailLevel: z.enum(['concise', 'balanced', 'deep'])
});

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const profile = await prisma.coachProfile.findUnique({
    where: { userId },
    select: {
      tone: true,
      detailLevel: true,
      updatedAt: true
    }
  });

  return NextResponse.json({
    profile: profile ?? {
      tone: 'encouraging',
      detailLevel: 'balanced',
      updatedAt: null
    }
  });
}

export async function PUT(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = updateProfileSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid profile payload.' }, { status: 400 });
  }

  const profile = await prisma.coachProfile.upsert({
    where: { userId },
    create: {
      userId,
      tone: parsed.data.tone,
      detailLevel: parsed.data.detailLevel
    },
    update: {
      tone: parsed.data.tone,
      detailLevel: parsed.data.detailLevel
    },
    select: {
      tone: true,
      detailLevel: true,
      updatedAt: true
    }
  });

  return NextResponse.json({ ok: true, profile });
}
