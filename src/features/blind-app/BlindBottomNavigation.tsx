'use client';

import { KeyboardEvent, useRef } from 'react';
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
    const tabRefs = useRef<Array<HTMLDivElement | null>>([]);
    const isDisabled = (tab: BlindAppTab) => callLocked && tab !== 'volunteer';

    const move = (startIndex: number, direction: -1 | 1) => {
        let index = startIndex;
        do {
            index = (index + direction + TABS.length) % TABS.length;
        } while (isDisabled(TABS[index].id) && index !== startIndex);
        tabRefs.current[index]?.focus();
        onSelect(TABS[index].id);
    };

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, index: number) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
            event.preventDefault();
            move(index, 1);
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
            event.preventDefault();
            move(index, -1);
        } else if (event.key === 'Home') {
            event.preventDefault();
            tabRefs.current.find((element, tabIndex) => !isDisabled(TABS[tabIndex].id))?.focus();
            onSelect(TABS.find(tab => !isDisabled(tab.id))!.id);
        } else if (event.key === 'End') {
            event.preventDefault();
            const indexFromEnd = [...TABS].reverse().findIndex(tab => !isDisabled(tab.id));
            const targetIndex = TABS.length - 1 - indexFromEnd;
            tabRefs.current[targetIndex]?.focus();
            onSelect(TABS[targetIndex].id);
        } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(TABS[index].id);
        }
    };

    return (
        <nav className="shrink-0 border-t border-white/[0.15] bg-black/80 backdrop-blur-2xl" role="tablist" aria-label="เมนูหลักสำหรับผู้พิการทางสายตา">
            <div className="mx-auto grid max-w-xl grid-cols-4 px-2 pt-2">
                {TABS.map((tab, index) => {
                    const disabled = isDisabled(tab.id);
                    return (
                        <div
                            key={tab.id}
                            ref={(element) => { tabRefs.current[index] = element; }}
                            id={`blind-app-tab-${tab.id}`}
                            role="tab"
                            aria-label={tab.ariaLabel}
                            aria-controls="blind-app-panel"
                            aria-selected={activeTab === tab.id}
                            aria-disabled={disabled || undefined}
                            tabIndex={activeTab === tab.id ? 0 : -1}
                            onClick={() => onSelect(tab.id)}
                            onKeyDown={(event) => onKeyDown(event, index)}
                            className={`flex min-h-[3.5rem] flex-col items-center justify-center gap-1 rounded-xl px-2 py-1 text-[11px] font-semibold outline-none transition-colors ${activeTab === tab.id ? 'text-[#0A84FF]' : 'text-[#8E8E93]'} ${disabled ? 'opacity-40' : 'active:opacity-70'}`}
                        >
                            {tab.icon}
                            {tab.label}
                        </div>
                    );
                })}
            </div>
        </nav>
    );
}
