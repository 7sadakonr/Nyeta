'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { useVolunteerHelp } from '@/hooks/useVolunteerHelp';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useDataChannel } from '@/hooks/useDataChannel';
import ChatPanel from '@/components/ChatPanel';
import ImageViewer from '@/components/ImageViewer';
import CaptureControls from '@/components/CaptureControls';

export default function VolunteerPage() {
    const {
        status,
        online,
        volunteerCount,
        incomingCall,
        error,
        remoteVideoRef,
        goOnline,
        goOffline,
        acceptCall,
        endCall,
        dataChannel: rawDataChannel,
    } = useVolunteerHelp();

    const dataChannel = useDataChannel(rawDataChannel, 'volunteer');
    const [messages, setMessages] = useState([]);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [capturedImage, setCapturedImage] = useState(null);
    const [captureState, setCaptureState] = useState('idle');

    useEffect(() => {
        if (!dataChannel) return;

        const handleMessage = (message) => {
            if (message.type === 'chat') {
                setMessages(prev => [...prev, { ...message.payload, timestamp: Date.now() }]);
                if (!isChatOpen) setUnreadCount(c => c + 1);
            } else if (message.type === 'capture-response') {
                setCapturedImage(message.payload.image);
                setCaptureState('idle');
            } else if (message.type === 'capture-status') {
                setCaptureState(message.payload.status);
            }
        };

        dataChannel.onMessage(handleMessage);
        return () => dataChannel.offMessage(handleMessage);
    }, [dataChannel, isChatOpen]);

    const handleSendMessage = useCallback((text) => {
        if (dataChannel) {
            dataChannel.sendChat(text);
            setMessages(prev => [...prev, { text, from: 'volunteer', timestamp: Date.now() }]);
        }
    }, [dataChannel]);

    const handleCaptureRequest = useCallback((options) => {
        if (dataChannel) {
            setCaptureState('requesting');
            dataChannel.sendCaptureRequest(options);
        }
    }, [dataChannel]);

    const handleToggleFlash = useCallback((flash) => {
        if (dataChannel) {
            dataChannel.sendToggleFlash(flash);
        }
    }, [dataChannel]);

    const { request: requestWakeLock, release: releaseWakeLock } = useWakeLock();
    const ringIntervalRef = useRef(null);

    // Simple ringtone while a call is incoming.
    useEffect(() => {
        if (!incomingCall) {
            if (ringIntervalRef.current) {
                clearInterval(ringIntervalRef.current);
                ringIntervalRef.current = null;
            }
            return;
        }

        const beep = () => {
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                const now = ctx.currentTime;
                osc.frequency.value = 980;
                gain.gain.setValueAtTime(0.25, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
                osc.start(now);
                osc.stop(now + 0.25);
            } catch {
                /* noop */
            }
            if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(200);
        };

        beep();
        ringIntervalRef.current = setInterval(beep, 1500);
        return () => {
            if (ringIntervalRef.current) {
                clearInterval(ringIntervalRef.current);
                ringIntervalRef.current = null;
            }
        };
    }, [incomingCall]);

    const inCall = status === 'connecting' || status === 'connected';

    // Keep the screen awake during a call so it isn't backgrounded mid-call.
    useEffect(() => {
        if (inCall) requestWakeLock();
        else releaseWakeLock();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inCall]);

    return (
        <div className="flex flex-col min-h-screen bg-slate-950 text-white font-sans">
            {/* Header */}
            <header className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
                <Link href="/" className="flex items-center gap-2 text-slate-300 hover:text-white" aria-label="กลับหน้าหลัก">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                    <span className="font-semibold">อาสาสมัคร</span>
                </Link>
                <span
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold ${
                        online ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                >
                    <span className={`w-2 h-2 rounded-full ${online ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                    {online ? 'ออนไลน์' : 'ออฟไลน์'}
                </span>
            </header>

            <main className="flex-1 flex flex-col p-5 gap-5">
                {error && (
                    <div className="bg-red-900/50 border border-red-700/50 text-red-100 rounded-xl px-4 py-3" role="alert">
                        {error}
                    </div>
                )}

                {/* Video area (active call) */}
                {inCall && (
                    <section className="relative rounded-2xl overflow-hidden bg-black flex-1 border border-slate-800 flex flex-col min-h-[400px]">
                        <video
                            ref={remoteVideoRef}
                            autoPlay
                            playsInline
                            className="absolute inset-0 w-full h-full object-contain bg-black"
                        />
                        <div className="absolute top-3 left-3 bg-black/60 backdrop-blur px-3 py-1.5 rounded-full text-sm font-semibold">
                            {status === 'connecting' ? 'กำลังเชื่อมต่อ...' : 'กำลังคุยอยู่'}
                        </div>

                        {/* Action Buttons Overlay */}
                        <div className="absolute top-3 right-3 flex flex-col gap-3 z-10">
                            <button 
                                onClick={() => {
                                    setIsChatOpen(true);
                                    setUnreadCount(0);
                                }}
                                className="relative p-3 bg-black/60 hover:bg-black/80 backdrop-blur rounded-full transition-colors"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                </svg>
                                {unreadCount > 0 && (
                                    <span className="absolute -top-1 -right-1 flex items-center justify-center w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full border-2 border-slate-900">
                                        {unreadCount}
                                    </span>
                                )}
                            </button>
                        </div>

                        {/* Capture Controls Overlay */}
                        {status === 'connected' && (
                            <div className="absolute bottom-6 left-0 right-0 flex justify-center z-10">
                                <CaptureControls onCapture={handleCaptureRequest} onToggleFlash={handleToggleFlash} captureState={captureState} />
                            </div>
                        )}
                    </section>
                )}

                {/* Idle / online dashboard */}
                {!inCall && (
                    <section className="flex-1 flex flex-col items-center justify-center text-center gap-6 py-10">
                        <div className={`w-28 h-28 rounded-full flex items-center justify-center border-4 ${online ? 'bg-emerald-500/15 border-emerald-400' : 'bg-slate-800 border-slate-700'}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-2xl font-black mb-2">
                                {online ? 'พร้อมรับสายช่วยเหลือ' : 'เริ่มเป็นอาสาสมัคร'}
                            </h1>
                            <p className="text-slate-400">
                                {online
                                    ? `มีอาสาสมัครออนไลน์ ${volunteerCount} คน`
                                    : 'เปิดสถานะออนไลน์เพื่อรอรับสายจากผู้พิการทางสายตา'}
                            </p>
                        </div>
                    </section>
                )}
            </main>

            {/* Incoming call overlay */}
            {incomingCall && !inCall && (
                <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur flex flex-col items-center justify-center p-8 text-center" role="dialog" aria-label="สายเรียกเข้า">
                    <div className="w-32 h-32 rounded-full bg-sky-500/20 border-4 border-sky-400 flex items-center justify-center mb-8 animate-pulse">
                        <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-sky-300">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
                        </svg>
                    </div>
                    <h2 className="text-3xl font-black mb-2">สายเรียกเข้า</h2>
                    <p className="text-slate-400 mb-10">ผู้พิการทางสายตาต้องการความช่วยเหลือ</p>
                    <div className="flex items-center gap-6">
                        <button
                            type="button"
                            onClick={() => endCall()}
                            className="w-20 h-20 rounded-full bg-red-600 hover:bg-red-500 active:scale-90 flex items-center justify-center focus:outline-none focus:ring-4 focus:ring-red-300"
                            aria-label="ปฏิเสธสาย"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rotate-[135deg]"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                        </button>
                        <button
                            type="button"
                            onClick={() => acceptCall()}
                            className="w-24 h-24 rounded-full bg-emerald-500 hover:bg-emerald-400 active:scale-90 flex items-center justify-center focus:outline-none focus:ring-4 focus:ring-emerald-300 shadow-[0_0_30px_rgba(16,185,129,0.5)]"
                            aria-label="รับสาย"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                        </button>
                    </div>
                </div>
            )}

            {/* Bottom control bar */}
            <div className="px-5 pb-8 pt-3 border-t border-slate-800">
                {inCall ? (
                    <button
                        type="button"
                        onClick={() => endCall()}
                        className="w-full py-5 rounded-2xl text-xl font-black bg-red-600 hover:bg-red-500 active:scale-95 transition-all focus:outline-none focus:ring-4 focus:ring-red-300"
                    >
                        วางสาย
                    </button>
                ) : online ? (
                    <button
                        type="button"
                        onClick={goOffline}
                        className="w-full py-5 rounded-2xl text-xl font-bold bg-slate-800 hover:bg-slate-700 active:scale-95 transition-all border border-slate-700 focus:outline-none focus:ring-4 focus:ring-slate-500"
                    >
                        ออฟไลน์
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={goOnline}
                        className="w-full py-5 rounded-2xl text-xl font-black bg-emerald-500 hover:bg-emerald-400 active:scale-95 transition-all focus:outline-none focus:ring-4 focus:ring-emerald-300"
                    >
                        เปิดรับสาย (ออนไลน์)
                    </button>
                )}
            </div>
            {/* Full-screen overlays */}
            <ChatPanel 
                isOpen={isChatOpen} 
                onClose={() => setIsChatOpen(false)} 
                messages={messages} 
                onSendMessage={handleSendMessage} 
            />
            
            <ImageViewer 
                imageBase64={capturedImage} 
                onClose={() => setCapturedImage(null)} 
            />
        </div>
    );
}
