import BlindHelpCall from '@/components/BlindHelpCall';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function CallPage() {
    return (
        <ErrorBoundary>
            <BlindHelpCall />
        </ErrorBoundary>
    );
}
