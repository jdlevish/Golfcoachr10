'use client';

import { FormEvent, useState } from 'react';
import { signIn } from 'next-auth/react';

export default function SignUpForm() {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get('name') ?? '');
    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');

    const registerResponse = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });

    if (!registerResponse.ok) {
      const payload = (await registerResponse.json().catch(() => null)) as
        | { error?: string }
        | null;
      setSubmitting(false);
      setError(payload?.error ?? 'Could not create account.');
      return;
    }

    const signInResponse = await signIn('credentials', {
      email,
      password,
      redirect: false
    });

    if (!signInResponse || signInResponse.error) {
      setSubmitting(false);
      setError('Account created, but automatic sign-in failed. Try signing in manually.');
      return;
    }

    window.location.href = '/dashboard';
  };

  return (
    <form onSubmit={onSubmit} className="auth-form">
      <label>
        Name
        <input name="name" type="text" maxLength={80} autoComplete="name" />
      </label>
      <label>
        Email
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          minLength={8}
          required
          autoComplete="new-password"
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? 'Creating account...' : 'Create account'}
      </button>
    </form>
  );
}
