import BlindCallScreen from '@/features/calling/BlindCallScreen';
import ErrorBoundary from '@/shared/ui/ErrorBoundary';

export default function CallPage() {
    return (
        <ErrorBoundary>
            <BlindCallScreen />
        </ErrorBoundary>
    );
}
