import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getUserNormalizedClubs } from '@/lib/club-trends';

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clubs = await getUserNormalizedClubs(userId);
  return NextResponse.json({ clubs });
}
