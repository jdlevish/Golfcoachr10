import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import SignUpForm from '@/components/sign-up-form';

export default async function SignUpPage() {
  const session = await auth();
  if (session?.user) {
    redirect('/dashboard');
  }

  return (
    <main className="page">
      <header>
        <p className="eyebrow">Golfcoachr10</p>
        <h1>Create account</h1>
      </header>

      <SignUpForm />
      <p className="helper-text">
        Already have an account? <Link href="/sign-in">Sign in</Link>.
      </p>
    </main>
  );
}
