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
    const statusColor = !aiReady ? 'bg-[#94A3B8]' : isWorking ? 'bg-[#38BDF8]' : 'bg-[#22C55E]';

    return (
        <header className="grid shrink-0 grid-cols-[3rem_1fr_auto] items-center gap-3 border-b border-[#E6EEF8] bg-white/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-sm">
            <Link
                href="/"
                className="flex min-h-12 min-w-12 items-center justify-center rounded-2xl bg-[#EFF6FF] text-[#1D4ED8] transition-transform active:scale-95"
                aria-label="กลับหน้าหลัก"
            >
                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            </Link>
            <div className="min-w-0 text-center" aria-hidden="true">
                <h1 className="text-lg font-bold tracking-[-0.025em] text-[#0F172A]">Nyeta</h1>
                <p className="truncate text-xs font-medium text-[#64748B]">{statusLabel}</p>
            </div>
            <span className="flex min-h-10 items-center gap-2 rounded-full border border-[#DBE7F5] bg-[#F8FBFF] px-3" aria-hidden="true" title={statusLabel}>
                <span className={`size-2.5 rounded-full ${statusColor}`} />
                <span className="text-xs font-semibold text-[#475569]">สถานะ</span>
            </span>
        </header>
    );
}
