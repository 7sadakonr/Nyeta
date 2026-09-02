'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import HapticFeedback, { HapticFeedbackHandle } from '@/shared/accessibility/HapticFeedback';
import { useBlindHelp } from '@/features/calling/hooks/useBlindHelp';
import { useWakeLock } from '@/shared/hooks/useWakeLock';
import { useDataChannel } from '@/features/calling/hooks/useDataChannel';
import { useCaptureHandler } from '@/features/calling/hooks/useCaptureHandler';
import BlindChatOverlay from '@/features/calling/components/BlindChatOverlay';
import { speechController } from '@/shared/accessibility/speechController';
import { useAccessibilitySpeechNavigation } from '@/shared/accessibility/useAccessibilitySpeechNavigation';
import { playEarcon } from '@/shared/accessibility/audio';

const STATUS_SPEECH: Record<string, string> = {
    calling: 'กำลังเรียกอาสาสมัคร กรุณารอสักครู่',
    connecting: 'อาสาสมัครรับสายแล้ว กำลังเชื่อมต่อ',
    connected: 'เชื่อมต่อแล้ว เริ่มพูดคุยได้เลย',
    'no-answer': 'ขออภัย ไม่มีอาสาสมัครว่างในขณะนี้ กรุณาลองใหม่อีกครั้ง',
    ended: 'วางสายแล้ว',
    error: 'เกิดข้อผิดพลาด กรุณาลองใหม่',
};

export interface BlindCallHandle {
    prepareForExit: () => void;
}

export interface BlindCallScreenProps {
    presentation?: 'standalone' | 'embedded';
    onStatusChange?: (status: import('@/features/calling/types').CallStatus) => void;
    audioReady?: boolean;
}

export default forwardRef<BlindCallHandle, BlindCallScreenProps>(function BlindCallScreen({ presentation = 'standalone', onStatusChange, audioReady = false }, ref) {
    const { status, error, startCall, endCall, reset, localVideoRef, remoteAudioRef, localStreamRef, dataChannel: rawDataChannel } = useBlindHelp();
    const { request: requestWakeLock, release: releaseWakeLock } = useWakeLock();
    const hapticRef = useRef<HapticFeedbackHandle | null>(null);
    const lastSpokenRef = useRef<string>('');
    const previousStatusRef = useRef(status);

    const dataChannel = useDataChannel(rawDataChannel, 'blind');
    const { captureState } = useCaptureHandler({
        localStreamRef,
        localVideoRef,
        dataChannel
    });
    const [latestMessage, setLatestMessage] = useState<{ from?: string; text?: string } | null>(null);
    const accessibilitySpeechNavigation = useAccessibilitySpeechNavigation();

    useEffect(() => {
        if (!dataChannel) return;
        const handleMessage = (message: any) => {
            if (message.type === 'chat') {
                setLatestMessage(message.payload);
            }
        };
        dataChannel.onMessage(handleMessage);
        return () => dataChannel.offMessage(handleMessage);
    }, [dataChannel]);

    const handleSendMessage = useCallback((text: string) => {
        if (dataChannel) {
            dataChannel.sendChat(text);
        }
    }, [dataChannel]);

    const speak = useCallback((text: string) => {
        if (!text || text === lastSpokenRef.current) return;
        lastSpokenRef.current = text;
        speechController.speak(text, { channel: 'status' });
    }, []);

    // React to status changes: announce, earcon, haptic.
    useEffect(() => {
        const statusChanged = previousStatusRef.current !== status;
        previousStatusRef.current = status;
        if (!statusChanged) return;
        onStatusChange?.(status);
        const message = status === 'error' ? (error || STATUS_SPEECH.error) : STATUS_SPEECH[status];
        if (message) speak(message);

        if (status === 'calling') {
            playEarcon('ring');
            hapticRef.current?.startContinuous();
        } else {
            hapticRef.current?.stopContinuous();
        }

        if (status === 'connecting') {
            playEarcon('connect');
            hapticRef.current?.trigger(2);
        }
        if (status === 'connected') {
            speechController.stop();
            playEarcon('connect');
            hapticRef.current?.trigger(3);
        }
        if (status === 'ended' || status === 'no-answer' || status === 'error') {
            playEarcon('end');
            hapticRef.current?.trigger(1);
        }
        const haptic = hapticRef.current;
        return () => haptic?.stopContinuous();
    }, [status, error, speak, onStatusChange]);

    const isActive = status === 'calling' || status === 'connecting' || status === 'connected';
    const isFinished = status === 'ended' || status === 'no-answer' || status === 'error';

    // Keep the screen awake during a call.
    useEffect(() => {
        if (isActive) requestWakeLock();
        else releaseWakeLock();
    }, [isActive, requestWakeLock, releaseWakeLock]);

    const prepareForExit = useCallback(() => {
        endCall(false);
        hapticRef.current?.stopContinuous();
        speechController.stop();
    }, [endCall]);

    useImperativeHandle(ref, () => ({ prepareForExit }), [prepareForExit]);

    useEffect(() => () => {
        hapticRef.current?.stopContinuous();
        speechController.stop();
    }, []);

    const statusLabel =
        status === 'calling' ? 'กำลังเรียกอาสาสมัคร...' :
        status === 'connecting' ? 'อาสาสมัครรับสายแล้ว กำลังเชื่อมต่อ...' :
        status === 'connected' ? 'กำลังคุยกับอาสาสมัคร' :
        status === 'no-answer' ? 'ไม่มีอาสาสมัครว่างในขณะนี้' :
        status === 'ended' ? 'วางสายแล้ว' :
        status === 'error' ? (error || 'เกิดข้อผิดพลาด') :
        'พร้อมเรียกอาสาสมัคร';

    return (
        <div {...accessibilitySpeechNavigation} className="flex h-full w-full flex-col bg-black text-white relative overflow-hidden font-sans">
            <HapticFeedback ref={hapticRef} />

            {/* Hidden media elements */}
            <video ref={localVideoRef} autoPlay muted playsInline className="sr-only" aria-hidden="true" />
            <audio ref={remoteAudioRef} autoPlay className="sr-only" aria-hidden="true" />

            {/* Capture Flash Overlay */}
            {captureState === 'flash-on' && (
                <div className="absolute inset-0 z-[60] bg-white pointer-events-none transition-opacity duration-75" />
            )}

            {/* Chat Overlay */}
            {status === 'connected' && (
                <BlindChatOverlay 
                    latestMessage={latestMessage}
                    onSendMessage={handleSendMessage}
                    audioReady={audioReady}
                />
            )}

            <main className="flex-1 flex flex-col items-center justify-center px-8 text-center">
                {/* Visual status indicator */}
                <div
                    className={`size-32 rounded-full flex items-center justify-center mb-8 transition-colors duration-500 ${
                        status === 'connected' ? 'bg-[#34C759]/20 text-[#34C759]' :
                        isActive ? 'bg-[#FF9F0A]/20 text-[#FF9F0A] animate-pulse' :
                        status === 'no-answer' || status === 'error' ? 'bg-[#FF453A]/20 text-[#FF453A]' :
                        'bg-[#0A84FF]/20 text-[#0A84FF]'
                    }`}
                    aria-hidden="true"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                </div>

                <h1 className="text-[28px] font-bold tracking-tight mb-2 text-white">{statusLabel}</h1>
                {!isActive && !isFinished && (
                    <p className="text-[17px] text-[#8E8E93] leading-relaxed">
                        กดปุ่มด้านล่างเพื่อโทรขอความช่วยเหลือจากอาสาสมัคร
                    </p>
                )}
            </main>

            {/* Bottom control */}
            <div className="px-4 pb-4 pt-2" role="group" aria-label="การควบคุมการโทร">
                {!isActive ? (
                    <button
                        type="button"
                        onClick={() => { onStatusChange?.('calling'); reset(); startCall(); }}
                        className="w-full py-4 rounded-xl text-[17px] font-semibold bg-[#0A84FF] text-white active:bg-[#007AFF] transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-[#0A84FF]/40"
                        aria-label={isFinished ? 'เรียกอาสาสมัครอีกครั้ง' : 'เรียกอาสาสมัคร'}
                    >
                        {isFinished ? 'เรียกอีกครั้ง' : 'เรียกอาสาสมัคร'}
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => endCall(true)}
                        className="w-full py-4 rounded-xl text-[17px] font-semibold bg-[#FF453A] text-white active:bg-[#D70015] transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-[#FF453A]/40"
                        aria-label="วางสาย"
                    >
                        วางสาย
                    </button>
                )}
            </div>
        </div>
    );
});
