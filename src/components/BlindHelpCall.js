'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import HapticFeedback from '@/components/HapticFeedback';
import { useBlindHelp } from '@/hooks/useBlindHelp';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useDataChannel } from '@/hooks/useDataChannel';
import { useCaptureHandler } from '@/hooks/useCaptureHandler';
import BlindChatOverlay from '@/components/BlindChatOverlay';
import speechManager, { Priority } from '@/lib/speechManager';

const STATUS_SPEECH = {
    calling: 'กำลังเรียกอาสาสมัคร กรุณารอสักครู่',
    connecting: 'อาสาสมัครรับสายแล้ว กำลังเชื่อมต่อ',
    connected: 'เชื่อมต่อแล้ว เริ่มพูดคุยได้เลย',
    'no-answer': 'ขออภัย ไม่มีอาสาสมัครว่างในขณะนี้ กรุณาลองใหม่อีกครั้ง',
    ended: 'วางสายแล้ว',
    error: 'เกิดข้อผิดพลาด กรุณาลองใหม่',
};

export default function BlindHelpCall() {
    const { status, error, startCall, endCall, reset, localVideoRef, remoteAudioRef, localStreamRef, dataChannel: rawDataChannel } = useBlindHelp();
    const { request: requestWakeLock, release: releaseWakeLock } = useWakeLock();
    const hapticRef = useRef(null);
    const lastSpokenRef = useRef('');

    const dataChannel = useDataChannel(rawDataChannel, 'blind');
    const { captureState } = useCaptureHandler({
        localStreamRef,
        localVideoRef,
        dataChannel
    });
    const [latestMessage, setLatestMessage] = useState(null);

    useEffect(() => {
        if (!dataChannel) return;
        const handleMessage = (message) => {
            if (message.type === 'chat') {
                setLatestMessage(message.payload);
            }
        };
        dataChannel.onMessage(handleMessage);
        return () => dataChannel.offMessage(handleMessage);
    }, [dataChannel]);

    const handleSendMessage = useCallback((text) => {
        if (dataChannel) {
            dataChannel.sendChat(text);
        }
    }, [dataChannel]);

    const speak = useCallback((text) => {
        if (!text || text === lastSpokenRef.current) return;
        lastSpokenRef.current = text;
        speechManager?.speak(text, {
            priority: Priority.HIGH,
            owner: 'call-status',
            rate: 1.1,
        });
    }, []);

    const playEarcon = useCallback((type) => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            const now = ctx.currentTime;
            if (type === 'ring') {
                osc.frequency.value = 880;
            } else if (type === 'connect') {
                osc.frequency.value = 660;
            } else {
                osc.frequency.value = 330;
            }
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        } catch {
            /* noop */
        }
    }, []);

    // React to status changes: announce, earcon, haptic.
    useEffect(() => {
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
            playEarcon('connect');
            hapticRef.current?.trigger(3);
        }
        if (status === 'ended' || status === 'no-answer' || status === 'error') {
            playEarcon('end');
            hapticRef.current?.trigger(1);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status, error]);

    const isActive = status === 'calling' || status === 'connecting' || status === 'connected';
    const isFinished = status === 'ended' || status === 'no-answer' || status === 'error';

    // Keep the screen awake during a call. A blind user won't touch the screen
    // while talking, so without this the phone auto-locks, the page is
    // backgrounded, and the camera/WebRTC connection drops.
    useEffect(() => {
        if (isActive) requestWakeLock();
        else releaseWakeLock();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isActive]);

    const statusLabel =
        status === 'calling' ? 'กำลังเรียกอาสาสมัคร...' :
        status === 'connecting' ? 'อาสาสมัครรับสายแล้ว กำลังเชื่อมต่อ...' :
        status === 'connected' ? 'กำลังคุยกับอาสาสมัคร' :
        status === 'no-answer' ? 'ไม่มีอาสาสมัครว่างในขณะนี้' :
        status === 'ended' ? 'วางสายแล้ว' :
        status === 'error' ? (error || 'เกิดข้อผิดพลาด') :
        'พร้อมเรียกอาสาสมัคร';

    return (
        <div className="flex flex-col h-screen bg-slate-900 text-white relative overflow-hidden font-sans">
            <HapticFeedback ref={hapticRef} />

            {/* Hidden media elements */}
            <video ref={localVideoRef} autoPlay muted playsInline className="sr-only" aria-hidden="true" />
            <audio ref={remoteAudioRef} autoPlay className="sr-only" aria-hidden="true" />

            {/* Live status for screen readers */}
            <div className="sr-only" role="status" aria-live="assertive" aria-atomic="true">
                {statusLabel}
            </div>

            {/* Capture Flash Overlay */}
            {captureState === 'flash-on' && (
                <div className="absolute inset-0 z-[60] bg-white pointer-events-none transition-opacity duration-75" />
            )}

            {/* Chat Overlay */}
            {status === 'connected' && (
                <BlindChatOverlay 
                    latestMessage={latestMessage}
                    onSendMessage={handleSendMessage}
                />
            )}

            {/* Top bar */}
            <div className="absolute top-0 inset-x-0 z-50 p-4 flex justify-start">
                <Link
                    href="/"
                    onClick={() => isActive && endCall(false)}
                    className="flex items-center gap-2 bg-black/50 hover:bg-black/70 text-white px-5 py-3 rounded-full backdrop-blur-md border border-white/20"
                    aria-label="กลับหน้าหลัก"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                </Link>
            </div>

            <main className="flex-1 flex flex-col items-center justify-center px-8 text-center">
                {/* Visual status indicator */}
                <div
                    className={`w-36 h-36 rounded-full flex items-center justify-center mb-8 border-4 transition-all ${
                        status === 'connected' ? 'bg-emerald-500/20 border-emerald-400' :
                        isActive ? 'bg-amber-500/20 border-amber-400 animate-pulse' :
                        status === 'no-answer' || status === 'error' ? 'bg-red-500/20 border-red-400' :
                        'bg-sky-500/20 border-sky-400'
                    }`}
                    aria-hidden="true"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                </div>

                <h1 className="text-3xl font-black mb-3" aria-hidden="true">{statusLabel}</h1>
                {!isActive && !isFinished && (
                    <p className="text-lg text-slate-400 mb-2" aria-hidden="true">
                        กดปุ่มด้านล่างเพื่อโทรขอความช่วยเหลือจากอาสาสมัคร
                    </p>
                )}
            </main>

            {/* Bottom control */}
            <div className="px-6 pb-12 pt-4">
                {!isActive ? (
                    <button
                        type="button"
                        onClick={() => { reset(); startCall(); }}
                        className="w-full py-7 rounded-3xl text-2xl font-black bg-sky-500 hover:bg-sky-400 active:scale-95 transition-all shadow-xl focus:outline-none focus:ring-4 focus:ring-sky-300"
                        aria-label={isFinished ? 'เรียกอาสาสมัครอีกครั้ง' : 'เรียกอาสาสมัคร'}
                    >
                        {isFinished ? 'เรียกอีกครั้ง' : 'เรียกอาสาสมัคร'}
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => endCall(true)}
                        className="w-full py-7 rounded-3xl text-2xl font-black bg-red-600 hover:bg-red-500 active:scale-95 transition-all shadow-xl focus:outline-none focus:ring-4 focus:ring-red-300"
                        aria-label="วางสาย"
                    >
                        วางสาย
                    </button>
                )}
            </div>
        </div>
    );
}
