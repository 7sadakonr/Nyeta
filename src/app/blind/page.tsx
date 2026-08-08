'use client';

import BlindAssistScreen from '@/features/blind-assistant/BlindAssistScreen';
import ErrorBoundary from '@/shared/ui/ErrorBoundary';

export default function BlindAssistPage() {
    return (
        <ErrorBoundary>
            <BlindAssistScreen />
        </ErrorBoundary>
    );
}
