'use client';

import { FormEvent, useState } from 'react';
import { signIn } from 'next-auth/react';

export default function SignInForm() {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');

    const response = await signIn('credentials', {
      email,
      password,
      redirect: false
    });

    if (!response || response.error) {
      setSubmitting(false);
      setError('Invalid email or password.');
      return;
    }

    window.location.href = '/dashboard';
  };

  return (
    <form onSubmit={onSubmit} className="auth-form">
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
          autoComplete="current-password"
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  );
}
