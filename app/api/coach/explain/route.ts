import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { generateCoachExplanation } from '@/lib/coach-explain';

const diagnosisSchema = z.object({
  primary: z.object({
    constraintType: z.enum(['DirectionConsistency', 'FaceControl', 'DistanceControl', 'StrikeQuality']),
    club: z.string(),
    severityScore: z.number(),
    confidence: z.enum(['High', 'Medium', 'Low']),
    keyMetrics: z.record(z.number().nullable()),
    scoreBreakdown: z.object({
      formula: z.string(),
      terms: z.record(z.number().nullable())
    })
  }),
  secondary: z
    .object({
      constraintType: z.enum(['DirectionConsistency', 'FaceControl', 'DistanceControl', 'StrikeQuality']),
      club: z.string(),
      severityScore: z.number(),
      confidence: z.enum(['High', 'Medium', 'Low']),
      keyMetrics: z.record(z.number().nullable()),
      scoreBreakdown: z.object({
        formula: z.string(),
        terms: z.record(z.number().nullable())
      })
    })
    .optional(),
  sessionHighlights: z
    .object({
      bestClubByConsistency: z.string().optional(),
      mostInconsistentClub: z.string().optional(),
      bestClubByDistanceControl: z.string().optional(),
      mostInconsistentDistanceClub: z.string().optional()
    })
    .optional()
});

const shapeEnum = z.enum([
  'PushFade',
  'PushDraw',
  'PullHook',
  'PullFade',
  'Straight',
  'StraightFade',
  'StraightDraw',
  'Push',
  'Pull'
]);

const missPatternSchema = z.object({
  topShape: shapeEnum,
  distribution: z.record(z.number()),
  severePctByShape: z.record(z.number()),
  topSevereShape: shapeEnum.nullable(),
  severePct: z.number(),
  totalShots: z.number()
});

const explainRequestSchema = z.object({
  diagnosis: diagnosisSchema,
  missPattern: missPatternSchema,
  userTone: z.enum(['encouraging', 'technical', 'direct'])
});

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = explainRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid explain payload.' }, { status: 400 });
  }

  const result = await generateCoachExplanation({
    ...parsed.data,
    diagnosis: {
      ...parsed.data.diagnosis,
      sessionHighlights: parsed.data.diagnosis.sessionHighlights ?? {}
    }
  });
  return NextResponse.json(result);
}
