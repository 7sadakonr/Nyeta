import React from 'react';
import Link from 'next/link';
import { BlindMode, AssistantStatus } from '@/features/blind-assistant/types/assistant';

export interface TopNavBarProps {
    aiReady: boolean;
    aiStatus: AssistantStatus;
    mode: BlindMode;
    currencyScanning: boolean;
    currencyMonitoring: boolean;
    statusLabel: string;
}

export default function TopNavBar({
    aiReady,
    aiStatus,
    mode,
    currencyScanning,
    currencyMonitoring,
    statusLabel,
}: TopNavBarProps) {
    const isWorking = aiStatus === 'thinking' || (mode === 'currency' && (currencyScanning || currencyMonitoring));
    const statusColor = !aiReady ? 'bg-[#A8B3C5]' : isWorking ? 'bg-[#6FE8FF]' : 'bg-[#4ADE80]';

    return (
        <header className="grid shrink-0 grid-cols-[3rem_1fr_3rem] items-center gap-2 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
            <Link href="/" className="flex min-h-12 min-w-12 items-center justify-center rounded-xl text-[#F8FAFC] transition-colors hover:bg-[#16243A]" aria-label="กลับหน้าหลัก">
                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            </Link>
            <h1 aria-hidden="true" className="text-center text-xl font-semibold tracking-[-0.02em] text-[#F8FAFC]">Nyeta</h1>
            <span className="flex justify-end" aria-hidden="true" title={statusLabel}>
                <span className={`size-2.5 rounded-full ${statusColor}`} />
            </span>
        </header>
    );
}
