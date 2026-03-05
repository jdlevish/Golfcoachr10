import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getClubTrendSeries } from '@/lib/club-trends';

export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const club = url.searchParams.get('club')?.trim() ?? '';
  const rangeParam = url.searchParams.get('range');
  const range = rangeParam ? Number(rangeParam) : 12;

  if (!club) {
    return NextResponse.json({ error: 'club is required' }, { status: 400 });
  }

  const series = await getClubTrendSeries(userId, club, range);
  return NextResponse.json({ series });
}
