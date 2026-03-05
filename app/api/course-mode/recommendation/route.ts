import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { getCourseModeRecommendation } from '@/lib/course-mode';

const schema = z.object({
  targetCarry: z.number().positive().max(400),
  windDirection: z.enum(['none', 'headwind', 'tailwind']).default('none'),
  windMph: z.number().min(0).max(60).default(0),
  lie: z.enum(['fairway', 'rough']).default('fairway')
});

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid course mode payload.' }, { status: 400 });
  }

  const recommendation = await getCourseModeRecommendation(userId, parsed.data);
  if (!recommendation) {
    return NextResponse.json(
      { error: 'No clubs with sufficient confidence are available yet. Add more session data.' },
      { status: 404 }
    );
  }

  return NextResponse.json(recommendation);
}
