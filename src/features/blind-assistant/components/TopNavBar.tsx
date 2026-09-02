import React from 'react';
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
    const statusColor = !aiReady ? 'bg-[#8E8E93]' : isWorking ? 'bg-[#0A84FF]' : 'bg-[#34C759]';

    return (
        <header className="grid shrink-0 grid-cols-[1fr_auto] items-center gap-3 border-b border-white/[0.15] bg-black/80 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-2xl">
            <div className="min-w-0 text-center" aria-hidden="true">
                <h1 className="text-[17px] font-semibold tracking-tight text-white">Nyeta</h1>
                <p className="truncate text-xs text-[#8E8E93]">{statusLabel}</p>
            </div>
            <span className="flex min-h-10 items-center gap-2 rounded-none px-1" aria-hidden="true" title={statusLabel}>
                <span className={`size-2.5 rounded-full ${statusColor}`} />
                <span className="text-xs font-semibold text-[#8E8E93]">สถานะ</span>
            </span>
        </header>
    );
}
