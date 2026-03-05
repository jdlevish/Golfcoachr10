import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { canonicalizeClubRaw, resolveClubNormalization, suggestNormalizedClubValues } from '@/lib/club-normalization';
import { getUserClubAliasMap } from '@/lib/club-aliases';
import { backfillUserSessionsClubNormalization } from '@/lib/session-club-normalization';
import { parseStoredSessionPayload } from '@/lib/session-storage';

const aliasSchema = z.object({
  raw: z.string().trim().min(1).max(128),
  normalized: z.string().trim().min(1).max(64)
});

const removeAliasSchema = z.object({
  raw: z.string().trim().min(1).max(128)
});

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await backfillUserSessionsClubNormalization(userId);
  const aliasMap = await getUserClubAliasMap(userId);
  const aliases = await prisma.clubAlias.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      raw: true,
      normalized: true,
      createdAt: true
    }
  });
  const sessions = await prisma.shotSession.findMany({
    where: { userId },
    select: {
      notes: true
    }
  });

  const rawStats = new Map<string, { raw: string; count: number; normalized: Set<string> }>();

  for (const sessionEntry of sessions) {
    const payload = parseStoredSessionPayload(sessionEntry.notes);
    if (!payload) continue;
    for (const shot of payload.shots) {
      const raw = shot.clubRaw?.trim() || shot.clubType || 'Unknown';
      const normalized = shot.clubNormalized?.trim() || shot.clubType || 'Unknown';
      const key = canonicalizeClubRaw(raw);
      const existing = rawStats.get(key) ?? {
        raw,
        count: 0,
        normalized: new Set<string>()
      };
      existing.count += 1;
      existing.normalized.add(normalized);
      rawStats.set(key, existing);
    }
  }

  const detectedRaw = Array.from(rawStats.entries())
    .map(([rawKey, stat]) => {
      const resolved = resolveClubNormalization(stat.raw, aliasMap);
      return {
        raw: stat.raw,
        rawKey,
        count: stat.count,
        normalizedDetected: Array.from(stat.normalized).sort((a, b) => a.localeCompare(b)),
        mappedNormalized: resolved.clubNormalized,
        mappingSource: resolved.source
      };
    })
    .sort((a, b) => a.raw.localeCompare(b.raw));

  const warnings = detectedRaw
    .filter((item) => item.normalizedDetected.length > 1)
    .map((item) => ({
      raw: item.raw,
      message: `Raw label "${item.raw}" appears with multiple normalized values: ${item.normalizedDetected.join(', ')}.`
    }));

  return NextResponse.json({
    aliases,
    detectedRaw,
    warnings,
    suggestions: suggestNormalizedClubValues()
  });
}

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = aliasSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid alias payload.' }, { status: 400 });
  }
  const exactProbe = resolveClubNormalization(parsed.data.raw, new Map());
  if (exactProbe.source === 'exact') {
    return NextResponse.json(
      { error: `Raw label "${parsed.data.raw}" is already covered by exact mapping (${exactProbe.clubNormalized}).` },
      { status: 400 }
    );
  }

  await prisma.clubAlias.upsert({
    where: {
      userId_raw: {
        userId,
        raw: parsed.data.raw
      }
    },
    update: {
      normalized: parsed.data.normalized
    },
    create: {
      userId,
      raw: parsed.data.raw,
      normalized: parsed.data.normalized
    }
  });

  await backfillUserSessionsClubNormalization(userId, true);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = removeAliasSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid alias payload.' }, { status: 400 });
  }

  await prisma.clubAlias.deleteMany({
    where: {
      userId,
      raw: parsed.data.raw
    }
  });

  await backfillUserSessionsClubNormalization(userId, true);
  return NextResponse.json({ ok: true });
}
