import VolunteerScreen from '@/features/calling/VolunteerScreen';
import ErrorBoundary from '@/shared/ui/ErrorBoundary';

export default function VolunteerPage() {
    return (
        <ErrorBoundary>
            <VolunteerScreen />
        </ErrorBoundary>
    );
}
