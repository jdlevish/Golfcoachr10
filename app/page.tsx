import Link from 'next/link';
import { auth } from '@/auth';

export default async function HomePage() {
  const session = await auth();

  return (
    <main className="page">
      <header>
        <p className="eyebrow">Golfcoachr10</p>
        <h1>Garmin R10 Range Session Coach</h1>
        <p>
          Upload Garmin R10 sessions, analyze gapping/consistency, and save progress with account-based
          access.
        </p>
      </header>

      {session?.user ? (
        <section className="auth-panel">
          <p>You are signed in as {session.user.email}.</p>
          <p>
            <Link href="/dashboard">Open dashboard</Link>
          </p>
        </section>
      ) : (
        <section className="auth-panel">
          <p>Create an account to start storing your sessions.</p>
          <p>
            <Link href="/sign-up">Create account</Link> | <Link href="/sign-in">Sign in</Link>
          </p>
        </section>
      )}
    </main>
  );
}
