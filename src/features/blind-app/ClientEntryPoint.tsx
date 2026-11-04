'use client';

import { useState, useEffect } from 'react';
import WelcomeScreen from './WelcomeScreen';
import BlindAppShell from './BlindAppShell';
import PortraitGuardian from '@/shared/ui/PortraitGuardian';
import { hasCompletedOnboarding } from './onboarding';
import type { BlindAppTab } from './types';

interface ClientEntryPointProps {
    initialTab: BlindAppTab;
}

type EntryPhase = 'checking' | 'welcome' | 'app';

export default function ClientEntryPoint({ initialTab }: ClientEntryPointProps) {
    // Rendered on the server before storage can be read, so the first client render must match: show nothing yet.
    const [phase, setPhase] = useState<EntryPhase>('checking');

    useEffect(() => {
        const automated = window.navigator.webdriver || window.location.search.includes('test=true');
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPhase(automated || hasCompletedOnboarding() ? 'app' : 'welcome');
    }, []);

    return (
        <>
            <PortraitGuardian />
            {phase === 'checking' && <div aria-hidden="true" className="min-h-dvh w-full bg-[#090909]" />}
            {phase === 'welcome' && <WelcomeScreen onStart={() => setPhase('app')} />}
            {phase === 'app' && <BlindAppShell initialTab={initialTab} />}
        </>
    );
}
