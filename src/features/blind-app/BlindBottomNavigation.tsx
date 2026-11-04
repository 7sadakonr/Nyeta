'use client';

import type { BlindAppTab } from './types';

import React from 'react';

const TABS: Array<{ id: BlindAppTab; label: string; ariaLabel: string; icon: React.ReactNode }> = [
    { id: 'assistant', label: 'AI', ariaLabel: 'AI ผู้ช่วย', icon: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="size-6 mb-1"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg> },
    { id: 'currency', label: 'เงิน', ariaLabel: 'สแกนธนบัตร', icon: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="size-6 mb-1"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg> },
    { id: 'reader', label: 'อ่าน', ariaLabel: 'อ่านเอกสาร', icon: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="size-6 mb-1"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg> },
    { id: 'volunteer', label: 'อาสา', ariaLabel: 'ขอความช่วยเหลือจากอาสา', icon: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="size-6 mb-1"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
];

interface BlindBottomNavigationProps {
    activeTab: BlindAppTab;
    callLocked: boolean;
    onSelect: (tab: BlindAppTab) => void;
}

export default function BlindBottomNavigation({ activeTab, callLocked, onSelect }: BlindBottomNavigationProps) {
    const isDisabled = (tab: BlindAppTab) => callLocked && tab !== 'volunteer';

    return (
        <nav className="shrink-0 border-t border-white/[0.15] bg-[#090909]/80 backdrop-blur-2xl" aria-label="เมนูหลัก">
            <div className="mx-auto grid max-w-xl grid-cols-4 px-2 pt-1.5 pb-2">
                {TABS.map((tab) => {
                    const disabled = isDisabled(tab.id);
                    const active = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            id={`blind-app-tab-${tab.id}`}
                            aria-label={tab.ariaLabel}
                            aria-current={active ? 'page' : undefined}
                            aria-disabled={disabled || undefined}
                            onClick={() => onSelect(tab.id)}
                            className={`flex min-h-[3.5rem] flex-col items-center justify-center gap-1 rounded-xl px-2 py-1 text-[11px] font-semibold outline-none transition-colors ${active ? 'text-[#0A84FF]' : 'text-[#8E8E93]'} ${disabled ? 'opacity-40' : 'active:opacity-70'}`}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}
