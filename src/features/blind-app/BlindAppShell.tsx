'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import BlindAssistScreen, { BlindAssistHandle } from '@/features/blind-assistant/BlindAssistScreen';
import BlindCallScreen, { BlindCallHandle } from '@/features/calling/BlindCallScreen';
import HapticFeedback, { HapticFeedbackHandle } from '@/shared/accessibility/HapticFeedback';
import { speechController } from '@/shared/accessibility/speechController';
import { useAccessibilitySpeechNavigation } from '@/shared/accessibility/useAccessibilitySpeechNavigation';
import { useOrientationLock } from '@/shared/hooks/useOrientationLock';
import { playEarcon } from '@/shared/accessibility/audio';
import { announce } from '@/shared/accessibility/announcer';
import BlindBottomNavigation from './BlindBottomNavigation';
import PwaControls from './PwaControls';
import { ACTIVE_CALL_STATUSES, ASSISTANT_TABS, BlindAppTab } from './types';
import type { CallStatus } from '@/features/calling/types';

export interface BlindAppShellProps {
    initialTab?: BlindAppTab;
}

const TAB_TITLES: Record<BlindAppTab, string> = {
    assistant: 'AI ผู้ช่วย',
    currency: 'สแกนธนบัตร',
    reader: 'อ่านเอกสาร',
    volunteer: 'ขอความช่วยเหลือจากอาสา',
};

const isAssistantTab = (tab: BlindAppTab): tab is typeof ASSISTANT_TABS[number] =>
    (ASSISTANT_TABS as readonly string[]).includes(tab);

export default function BlindAppShell({ initialTab = 'assistant' }: BlindAppShellProps) {
    useOrientationLock();

    const [activeTab, setActiveTab] = useState<BlindAppTab>(initialTab);
    const [callStatus, setCallStatus] = useState<CallStatus>('idle');
    const assistantRef = useRef<BlindAssistHandle | null>(null);
    const callRef = useRef<BlindCallHandle | null>(null);
    const hapticRef = useRef<HapticFeedbackHandle | null>(null);
    const callLocked = ACTIVE_CALL_STATUSES.includes(callStatus);

    const activateBlindAudio = useCallback(() => {
        speechController.unlockAudio();
    }, []);
    const accessibilityNavigationHandlers = useAccessibilitySpeechNavigation(activateBlindAudio);

    const selectTab = useCallback((nextTab: BlindAppTab) => {
        if (nextTab === activeTab) return;
        if (callLocked && nextTab !== 'volunteer') {
            // iPhone has no vibration API, so the refusal must be audible too.
            void hapticRef.current?.trigger(2);
            playEarcon('error');
            announce('วางสายก่อนเปลี่ยนเมนู');
            return;
        }

        speechController.stop();

        if (activeTab === 'volunteer') {
            callRef.current?.prepareForExit();
            setCallStatus('idle');
        } else if (nextTab === 'volunteer') {
            assistantRef.current?.prepareForCall();
        }

        switch(nextTab) {
            case 'assistant': {
                playEarcon('mode-assistant');
                break;
            }
            case 'reader': {
                playEarcon('mode-reader');
                break;
            }
            case 'currency': {
                playEarcon('mode-currency');
                break;
            }
            case 'volunteer': {
                playEarcon('mode-volunteer');
                break;
            }
        }
        if (isAssistantTab(nextTab)) {
            window.localStorage.setItem('nyeta_blind_mode', nextTab);
        }
        void hapticRef.current?.trigger(1);
        setActiveTab(nextTab);
        // Keep the address in step with the tab so a reload (e.g. after an update) comes back to the same tab.
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('tab', nextTab);
            window.history.replaceState(window.history.state, '', url);
        } catch {
            // Ignore: only the reload target is affected.
        }
    }, [activeTab, callLocked]);

    useEffect(() => {
        document.documentElement.style.backgroundColor = '#090909';
        document.body.style.backgroundColor = '#090909';
        
        let metaThemeColor = document.querySelector('meta[name="theme-color"]');
        let oldThemeColor = '';
        if (metaThemeColor) {
            oldThemeColor = metaThemeColor.getAttribute('content') || '';
            metaThemeColor.setAttribute('content', '#090909');
        } else {
            metaThemeColor = document.createElement('meta');
            metaThemeColor.setAttribute('name', 'theme-color');
            metaThemeColor.setAttribute('content', '#090909');
            document.head.appendChild(metaThemeColor);
        }

        return () => {
            document.documentElement.style.backgroundColor = '';
            document.body.style.backgroundColor = '';
            if (metaThemeColor && oldThemeColor) {
                metaThemeColor.setAttribute('content', oldThemeColor);
            }
        };
    }, []);

    return (
        <div
            className="nyeta-surface fixed inset-0 flex w-full flex-col overflow-hidden bg-[#090909] text-white"
            {...accessibilityNavigationHandlers}
        >
            <HapticFeedback ref={hapticRef} />
            <PwaControls callActive={callLocked} audioReady={true} />
            {/* The single main landmark and page heading; VoiceOver's rotor can jump straight to the current mode. */}
            <main id="blind-app-panel" className="min-h-0 flex-1 overflow-hidden">
                <h1 className="sr-only">{TAB_TITLES[activeTab]}</h1>
                {activeTab === 'volunteer' ? (
                    <BlindCallScreen ref={callRef} presentation="embedded" onStatusChange={setCallStatus} audioReady={true} />
                ) : (
                    <BlindAssistScreen ref={assistantRef} mode={activeTab} presentation="embedded" audioReady={true} />
                )}
            </main>
            <BlindBottomNavigation activeTab={activeTab} callLocked={callLocked} onSelect={selectTab} />
        </div>
    );
}
