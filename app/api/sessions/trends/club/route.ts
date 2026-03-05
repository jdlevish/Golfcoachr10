import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getClubTrendSeries, type ClubTrendRange } from '@/lib/club-trends';
import { backfillUserSessionsClubNormalization } from '@/lib/session-club-normalization';

export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await backfillUserSessionsClubNormalization(userId);

  const url = new URL(request.url);
  const club = url.searchParams.get('club')?.trim() ?? '';
  const rangeParam = url.searchParams.get('range');
  const range: number | ClubTrendRange =
    rangeParam === '7d' || rangeParam === '30d' || rangeParam === '90d' || rangeParam === '1y' || rangeParam === 'all'
      ? rangeParam
      : rangeParam
        ? Number(rangeParam)
        : 'all';

  if (!club) {
    return NextResponse.json({ error: 'club is required' }, { status: 400 });
  }

  const series = await getClubTrendSeries(userId, club, range);
  return NextResponse.json({ series });
}
