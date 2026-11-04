'use client';

import { useState, useEffect } from 'react';
import WelcomeScreen from './WelcomeScreen';
import BlindAppShell from './BlindAppShell';
import PortraitGuardian from '@/shared/ui/PortraitGuardian';
import { hasCompletedOnboarding } from './onboarding';
import { ASSISTANT_TABS, type BlindAppTab } from './types';
import { LiveAnnouncer } from '@/shared/accessibility/announcer';

interface ClientEntryPointProps {
    /** Explicit tab (tests); otherwise `?tab=` or the last used camera mode is used. */
    initialTab?: BlindAppTab;
}

type EntryPhase = 'checking' | 'welcome' | 'app';

const TABS: readonly BlindAppTab[] = ['assistant', 'currency', 'reader', 'volunteer'];

function resolveInitialTab(): BlindAppTab {
    const fromUrl = new URLSearchParams(window.location.search).get('tab');
    if (TABS.includes(fromUrl as BlindAppTab)) return fromUrl as BlindAppTab;
    try {
        const stored = window.localStorage.getItem('nyeta_blind_mode');
        if ((ASSISTANT_TABS as readonly string[]).includes(stored ?? '')) return stored as BlindAppTab;
    } catch {
        // Storage can be blocked; start on the default tab.
    }
    return 'assistant';
}

export default function ClientEntryPoint({ initialTab }: ClientEntryPointProps) {
    // Rendered on the server before storage and the URL can be read, so the first client render must match: show nothing yet.
    const [phase, setPhase] = useState<EntryPhase>('checking');
    const [tab, setTab] = useState<BlindAppTab>(initialTab ?? 'assistant');

    useEffect(() => {
        const automated = window.navigator.webdriver || window.location.search.includes('test=true');
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTab(initialTab ?? resolveInitialTab());
        setPhase(automated || hasCompletedOnboarding() ? 'app' : 'welcome');
    }, [initialTab]);

    return (
        <>
            <LiveAnnouncer />
            <PortraitGuardian />
            {phase === 'checking' && <div aria-hidden="true" className="min-h-dvh w-full bg-[#090909]" />}
            {phase === 'welcome' && <WelcomeScreen onStart={() => setPhase('app')} />}
            {phase === 'app' && <div id="nyeta-app"><BlindAppShell initialTab={tab} /></div>}
        </>
    );
}
