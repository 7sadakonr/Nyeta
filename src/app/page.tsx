import BlindAppShell from '@/features/blind-app/BlindAppShell';
import ErrorBoundary from '@/shared/ui/ErrorBoundary';
import type { BlindAppTab } from '@/features/blind-app/types';

const TABS: readonly BlindAppTab[] = ['assistant', 'currency', 'reader', 'volunteer'];

export default async function Home({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const params = await searchParams;
  const initialTab = TABS.includes(params.tab as BlindAppTab) ? params.tab as BlindAppTab : 'assistant';

  return (
    <ErrorBoundary>
      <BlindAppShell initialTab={initialTab} />
    </ErrorBoundary>
  );
}
