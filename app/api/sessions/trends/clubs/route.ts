import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getUserNormalizedClubs } from '@/lib/club-trends';
import { backfillUserSessionsClubNormalization } from '@/lib/session-club-normalization';

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await backfillUserSessionsClubNormalization(userId);

  const clubs = await getUserNormalizedClubs(userId);
  return NextResponse.json({ clubs });
}
