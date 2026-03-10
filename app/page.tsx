import { auth } from '@/auth';
import HomeDashboard from '@/components/home-dashboard';

function getGreeting(date: Date) {
  const hour = date.getHours();

  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function getUserName(name?: string | null, email?: string | null) {
  if (name?.trim()) {
    return name.trim().split(/\s+/)[0];
  }

  if (email?.trim()) {
    return email.trim().split('@')[0];
  }

  return 'Joshua';
}

export default async function HomePage() {
  const session = await auth();

  return (
    <HomeDashboard
      isSignedIn={Boolean(session?.user)}
      userName={getUserName(session?.user?.name, session?.user?.email)}
      greeting={getGreeting(new Date())}
    />
  );
}
