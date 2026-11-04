import ClientEntryPoint from '@/features/blind-app/ClientEntryPoint';
import ErrorBoundary from '@/shared/ui/ErrorBoundary';

// Deliberately does not read searchParams: that made every open a server render. The initial tab is resolved on the
// client (see ClientEntryPoint), so this page can be served statically and from the service worker cache.
export default function Home() {
  return (
    <ErrorBoundary>
      <ClientEntryPoint />
    </ErrorBoundary>
  );
}
