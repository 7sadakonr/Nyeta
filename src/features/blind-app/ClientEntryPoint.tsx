'use client';

import { useState } from 'react';
import WelcomeScreen from './WelcomeScreen';
import BlindAppShell from './BlindAppShell';
import type { BlindAppTab } from './types';

interface ClientEntryPointProps {
    initialTab: BlindAppTab;
}

export default function ClientEntryPoint({ initialTab }: ClientEntryPointProps) {
    const [started, setStarted] = useState(false);

    if (!started) {
        return <WelcomeScreen onStart={() => setStarted(true)} />;
    }

    return <BlindAppShell initialTab={initialTab} />;
}
