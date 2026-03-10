import { auth } from '@/auth';
import RangeModeShell from '@/components/range-mode-shell';

export default async function RangeModePage() {
  const session = await auth();

  return <RangeModeShell isSignedIn={Boolean(session?.user)} />;
}
