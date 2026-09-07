import React from 'react';
import { BlindMode, AssistantStatus } from '@/features/blind-assistant/types/assistant';

export interface TopNavBarProps {
    aiReady?: boolean;
    aiStatus?: AssistantStatus;
    mode?: BlindMode;
    currencyScanning?: boolean;
    currencyMonitoring?: boolean;
    statusLabel?: string;
}

export default function TopNavBar(_props?: TopNavBarProps) {
    return (
        <header
            className="shrink-0 bg-[#090909] pt-[calc(env(safe-area-inset-top)+0.75rem)]"
            aria-hidden="true"
        />
    );
}
