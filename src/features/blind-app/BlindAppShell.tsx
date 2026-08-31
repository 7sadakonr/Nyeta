'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import BlindAssistScreen, { BlindAssistHandle } from '@/features/blind-assistant/BlindAssistScreen';
import BlindCallScreen, { BlindCallHandle } from '@/features/calling/BlindCallScreen';
import HapticFeedback, { HapticFeedbackHandle } from '@/shared/accessibility/HapticFeedback';
import speechManager, { Priority } from '@/shared/accessibility/speechManager';
import { SpeechCategory } from '@/shared/types/speech';
import BlindBottomNavigation from './BlindBottomNavigation';
import PwaControls from './PwaControls';
import { ACTIVE_CALL_STATUSES, ASSISTANT_TABS, BlindAppTab } from './types';
import type { CallStatus } from '@/features/calling/types';

export interface BlindAppShellProps {
    initialTab?: BlindAppTab;
}

const isAssistantTab = (tab: BlindAppTab): tab is typeof ASSISTANT_TABS[number] =>
    (ASSISTANT_TABS as readonly string[]).includes(tab);

const ENTRY_AUDIO_RETRY_MS = 300;
const MAX_ENTRY_AUDIO_ATTEMPTS = 3;

export default function BlindAppShell({ initialTab = 'assistant' }: BlindAppShellProps) {
    const [activeTab, setActiveTab] = useState<BlindAppTab>(initialTab);
    const [callStatus, setCallStatus] = useState<CallStatus>('idle');
    const [audioReady, setAudioReady] = useState(() => speechManager?.audioReady ?? false);
    const assistantRef = useRef<BlindAssistHandle | null>(null);
    const callRef = useRef<BlindCallHandle | null>(null);
    const hapticRef = useRef<HapticFeedbackHandle | null>(null);
    const entryAudioRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const callLocked = ACTIVE_CALL_STATUSES.includes(callStatus);

    const audioActivationOptions = useCallback(() => ({
            priority: Priority.ACTION,
            category: SpeechCategory.TASK,
            owner: 'blind-entry',
            scope: 'blind:app',
            rate: 1.1,
            dedupe: 'blind-entry',
            onStart: () => setAudioReady(true),
    }), []);

    const activateBlindAudio = useCallback(() => {
        if (entryAudioRetryTimerRef.current) {
            clearTimeout(entryAudioRetryTimerRef.current);
            entryAudioRetryTimerRef.current = null;
        }
        if (speechManager?.audioReady) {
            setAudioReady(true);
            return;
        }
        speechManager?.activateFromUserGesture('ผู้ช่วยพร้อม', audioActivationOptions());
    }, [audioActivationOptions]);

    useEffect(() => {
        let cancelled = false;
        let attempts = 0;
        const initialize = () => {
            attempts += 1;
            let started = false;
            const options = audioActivationOptions();
            speechManager?.initializeAudio('ผู้ช่วยพร้อม', {
                ...options,
                onStart: () => {
                    started = true;
                    options.onStart?.();
                },
                onEnd: (completed) => {
                    if (completed || started || cancelled || attempts >= MAX_ENTRY_AUDIO_ATTEMPTS) return;
                    entryAudioRetryTimerRef.current = setTimeout(initialize, ENTRY_AUDIO_RETRY_MS);
                },
            });
        };
        initialize();
        return () => {
            cancelled = true;
            if (entryAudioRetryTimerRef.current) clearTimeout(entryAudioRetryTimerRef.current);
            entryAudioRetryTimerRef.current = null;
        };
    }, [audioActivationOptions]);

    const cancelScope = useCallback((scope: string) => {
        speechManager?.clearPausedSpeech();
        speechManager?.cancel({ scope });
    }, []);

    const selectTab = useCallback((nextTab: BlindAppTab) => {
        if (nextTab === activeTab) return;
        if (callLocked && nextTab !== 'volunteer') {
            void hapticRef.current?.trigger(2);
            if (audioReady) speechManager?.speak('กรุณาวางสายก่อนเปลี่ยนเมนู', {
                priority: Priority.HIGH,
                category: SpeechCategory.TASK,
                owner: 'blind-tab-lock',
                scope: 'blind:volunteer',
                dedupe: true,
            });
            return;
        }

        if (activeTab === 'volunteer') {
            callRef.current?.prepareForExit();
            cancelScope('blind:volunteer');
            setCallStatus('idle');
        } else if (nextTab === 'volunteer') {
            assistantRef.current?.prepareForCall();
        } else {
            cancelScope(`blind:${activeTab}`);
        }

        if (isAssistantTab(nextTab)) {
            window.localStorage.setItem('nyeta_blind_mode', nextTab);
        }
        void hapticRef.current?.trigger(1);
        setActiveTab(nextTab);
    }, [activeTab, audioReady, callLocked, cancelScope]);

    useEffect(() => {
        document.documentElement.style.backgroundColor = '#000000';
        document.body.style.backgroundColor = '#000000';
        
        let metaThemeColor = document.querySelector('meta[name="theme-color"]');
        let oldThemeColor = '';
        if (metaThemeColor) {
            oldThemeColor = metaThemeColor.getAttribute('content') || '';
            metaThemeColor.setAttribute('content', '#000000');
        } else {
            metaThemeColor = document.createElement('meta');
            metaThemeColor.setAttribute('name', 'theme-color');
            metaThemeColor.setAttribute('content', '#000000');
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
            className="nyeta-surface fixed inset-0 flex w-full flex-col overflow-hidden bg-black text-white"
            onTouchStartCapture={activateBlindAudio}
            onClickCapture={activateBlindAudio}
        >
            <HapticFeedback ref={hapticRef} />
            <PwaControls callActive={callLocked} audioReady={audioReady} />
            <section id="blind-app-panel" role="tabpanel" aria-labelledby={`blind-app-tab-${activeTab}`} className="min-h-0 flex-1 overflow-hidden">
                {activeTab === 'volunteer' ? (
                    <BlindCallScreen ref={callRef} presentation="embedded" onStatusChange={setCallStatus} audioReady={audioReady} />
                ) : (
                    <BlindAssistScreen ref={assistantRef} mode={activeTab} presentation="embedded" audioReady={audioReady} />
                )}
            </section>
            <BlindBottomNavigation activeTab={activeTab} callLocked={callLocked} onSelect={selectTab} />
        </div>
    );
}
