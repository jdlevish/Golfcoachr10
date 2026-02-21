import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import SignInForm from '@/components/sign-in-form';

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) {
    redirect('/dashboard');
  }

  return (
    <main className="page">
      <header>
        <p className="eyebrow">Golfcoachr10</p>
        <h1>Sign in</h1>
      </header>

      <SignInForm />
      <p className="helper-text">
        Need an account? <Link href="/sign-up">Create one</Link>.
      </p>
    </main>
  );
}
