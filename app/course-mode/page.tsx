import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import CourseModeShell from '@/components/course-mode-shell';

export default async function CourseModePage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/sign-in');
  }

  return <CourseModeShell />;
}
