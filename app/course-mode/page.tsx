import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import CourseModeShell from '@/components/course-mode-shell';

export default async function CourseModePage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/sign-in');
  }

  return (
    <main className="page">
      <header>
        <p className="eyebrow">Golfcoachr10</p>
        <h1>Course Mode</h1>
        <p>Quick on-course club recommendation based on your recent rolling stats.</p>
      </header>

      <div className="dashboard-actions">
        <Link href="/dashboard">Back to dashboard</Link>
        <Link href="/trends">View trends</Link>
      </div>

      <CourseModeShell />
    </main>
  );
}
