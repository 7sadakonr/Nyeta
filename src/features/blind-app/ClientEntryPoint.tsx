'use client';

import { useState, useEffect } from 'react';
import WelcomeScreen from './WelcomeScreen';
import BlindAppShell from './BlindAppShell';
import type { BlindAppTab } from './types';

interface ClientEntryPointProps {
    initialTab: BlindAppTab;
}

export default function ClientEntryPoint({ initialTab }: ClientEntryPointProps) {
    const [started, setStarted] = useState(false);

    useEffect(() => {
        if (typeof window !== 'undefined' && (window.navigator.webdriver || window.location.search.includes('test=true'))) {
            setStarted(true);
        }
    }, []);

    if (!started) {
        return <WelcomeScreen onStart={() => setStarted(true)} />;
    }

    return <BlindAppShell initialTab={initialTab} />;
}
