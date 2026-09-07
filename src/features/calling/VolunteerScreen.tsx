'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useVolunteerHelp } from '@/features/calling/hooks/useVolunteerHelp';
import { useWakeLock } from '@/shared/hooks/useWakeLock';
import { useDataChannel } from '@/features/calling/hooks/useDataChannel';
import { playBeep } from '@/shared/accessibility/audio';
import ChatPanel, { ChatMessage } from '@/features/calling/components/ChatPanel';
import ImageViewer from '@/features/calling/components/ImageViewer';
import CaptureControls from '@/features/calling/components/CaptureControls';
import { CaptureState } from '@/features/calling/hooks/useCaptureHandler';

export default function VolunteerScreen() {
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
        dismissIncoming,
        dataChannel: rawDataChannel,
    } = useVolunteerHelp();

    const dataChannel = useDataChannel(rawDataChannel, 'volunteer');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
    const [unreadCount, setUnreadCount] = useState<number>(0);
    const [capturedImage, setCapturedImage] = useState<string | null>(null);
    const [captureState, setCaptureState] = useState<CaptureState>('idle');

    useEffect(() => {
        if (!dataChannel) return;

        const handleMessage = (message: any) => {
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

    const handleSendMessage = useCallback((text: string) => {
        if (dataChannel) {
            dataChannel.sendChat(text);
            setMessages(prev => [...prev, { text, from: 'volunteer', timestamp: Date.now() }]);
        }
    }, [dataChannel]);

    const handleCaptureRequest = useCallback((options?: { flash?: boolean }) => {
        if (dataChannel) {
            setCaptureState('requesting');
            dataChannel.sendCaptureRequest(options);
        }
    }, [dataChannel]);

    const handleToggleFlash = useCallback((flash: boolean) => {
        if (dataChannel) {
            dataChannel.sendToggleFlash(flash);
        }
    }, [dataChannel]);

    const { request: requestWakeLock, release: releaseWakeLock } = useWakeLock();
    const ringIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
            playBeep(980, 0.25);
            if (typeof navigator !== 'undefined' && (navigator as any).vibrate) {
                (navigator as any).vibrate(200);
            }
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

    // Reset state when new call starts
    useEffect(() => {
        if (inCall) {
            setMessages([]);
            setUnreadCount(0);
            setCapturedImage(null);
            setCaptureState('idle');
        }
    }, [inCall]);

    // Keep the screen awake during a call so it isn't backgrounded mid-call.
    useEffect(() => {
        if (inCall) requestWakeLock();
        else releaseWakeLock();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inCall]);

    // Synchronize page background and mobile browser theme color
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
            className={`flex h-dvh flex-col bg-vol-bg text-vol-text font-sans selection:bg-vol-accent selection:text-black ${
                inCall ? 'overflow-hidden' : 'overflow-y-auto overscroll-y-contain'
            }`}
        >
            {/* Header */}
            <header className="flex items-center justify-between border-b border-white/[0.08] px-4 sm:px-6 py-3 bg-[#090909]/90 backdrop-blur-md sticky top-0 z-30 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
                <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src="/icons/nyeta-192.png"
                        alt=""
                        width={32}
                        height={32}
                        className="w-8 h-8 rounded-lg object-cover shadow-sm ring-1 ring-white/10"
                    />
                    <div className="flex items-baseline gap-2">
                        <span className="text-base font-bold tracking-tight text-white">Nyeta</span>
                        <span className="text-xs font-semibold text-vol-accent tracking-wide uppercase">อาสาสมัคร</span>
                    </div>
                </div>

                <div
                    className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        online
                            ? 'bg-vol-accent/10 text-vol-accent border border-vol-accent/25'
                            : 'bg-white/[0.04] text-zinc-400 border border-white/[0.08]'
                    }`}
                    role="status"
                    aria-label={online ? 'สถานะ: ออนไลน์' : 'สถานะ: ออฟไลน์'}
                >
                    <span className="relative flex h-2 w-2">
                        {online && (
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-vol-accent opacity-75 motion-reduce:animate-none" />
                        )}
                        <span className={`relative inline-flex rounded-full h-2 w-2 ${online ? 'bg-vol-accent' : 'bg-zinc-600'}`} />
                    </span>
                    <span>{online ? 'ออนไลน์' : 'ออฟไลน์'}</span>
                </div>
            </header>

            {/* Main Content Area */}
            <main
                className={`flex-1 flex flex-col min-h-0 ${
                    inCall
                        ? 'p-2.5 sm:p-4 md:p-5 overflow-hidden'
                        : 'p-4 sm:p-6 lg:p-8 pb-[max(2rem,calc(env(safe-area-inset-bottom)+1.5rem))] sm:pb-8'
                }`}
            >
                {error && (
                    <div
                        className="w-full max-w-5xl mx-auto mb-4 bg-red-950/40 border border-red-800/60 text-red-200 rounded-xl px-4 py-3 text-sm flex items-center gap-2.5 shadow-sm"
                        role="alert"
                    >
                        <svg className="w-5 h-5 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span>{error}</span>
                    </div>
                )}

                {/* Active Call View (Viewport Locked, Zero Overflow) */}
                {inCall && (
                    <div className="w-full max-w-5xl mx-auto flex-1 flex flex-col min-h-0 h-full overflow-hidden justify-between">
                        <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0 items-center justify-center relative overflow-hidden py-1">
                            {/* Constrained Video Card */}
                            <section
                                className="relative rounded-2xl overflow-hidden bg-black border border-white/10 flex-1 flex flex-col min-h-0 w-full max-w-2xl h-full max-h-[calc(100dvh-11rem)] shadow-lg"
                                aria-label="วิดีโอจากผู้ขอความช่วยเหลือ"
                            >
                                <video
                                    ref={remoteVideoRef}
                                    autoPlay
                                    playsInline
                                    className="w-full h-full object-contain bg-black"
                                />

                                {/* Status Indicator Badge */}
                                <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-3 py-1 rounded-full text-xs font-medium text-white border border-white/10 flex items-center gap-2 z-10">
                                    <span
                                        className={`w-2 h-2 rounded-full ${
                                            status === 'connected' ? 'bg-vol-accent animate-pulse motion-reduce:animate-none' : 'bg-amber-400'
                                        }`}
                                    />
                                    <span>{status === 'connecting' ? 'กำลังเชื่อมต่อ...' : 'กำลังคุยอยู่'}</span>
                                </div>

                                {/* Mobile Chat Toggle Button Overlay */}
                                <div className="absolute top-3 right-3 flex items-center gap-2 z-10 md:hidden">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsChatOpen(true);
                                            setUnreadCount(0);
                                        }}
                                        className="relative p-2.5 bg-black/70 hover:bg-black/90 text-white backdrop-blur-md rounded-full border border-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-vol-accent"
                                        aria-label="เปิดแชท"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                        </svg>
                                        {unreadCount > 0 && (
                                            <span className="absolute -top-1 -right-1 flex items-center justify-center w-5 h-5 bg-vol-accent text-black text-[10px] font-bold rounded-full border border-black">
                                                {unreadCount}
                                            </span>
                                        )}
                                    </button>
                                </div>
                            </section>

                            {/* Side Chat Panel (Desktop side-by-side with matching height ceiling, Mobile overlay) */}
                            <div
                                className={`
                                    ${isChatOpen ? 'fixed inset-0 z-50 md:static md:z-auto' : 'hidden md:flex'}
                                    md:w-80 lg:w-96 md:flex-col md:h-full md:max-h-[calc(100dvh-11rem)] md:min-h-0
                                `}
                            >
                                <ChatPanel
                                    isOpen={true}
                                    onClose={() => setIsChatOpen(false)}
                                    messages={messages}
                                    onSendMessage={handleSendMessage}
                                    className="w-full h-full md:rounded-2xl"
                                />
                            </div>
                        </div>

                        {/* Unified Call Control Dock (Compact, centered, zero horizontal stretching) */}
                        <div className="shrink-0 py-2 sm:py-3 flex items-center justify-center">
                            {status === 'connected' ? (
                                <CaptureControls
                                    onCapture={handleCaptureRequest}
                                    onToggleFlash={handleToggleFlash}
                                    onEndCall={endCall}
                                    captureState={captureState}
                                />
                            ) : (
                                <div className="inline-flex items-center gap-2 p-1.5 rounded-full bg-[#141414]/95 backdrop-blur-md border border-white/10 shadow-2xl">
                                    <span className="text-xs text-zinc-400 px-3 font-medium flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                                        กำลังเชื่อมต่อสาย...
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => endCall()}
                                        className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs sm:text-sm font-bold bg-red-600 hover:bg-red-500 active:scale-95 text-white transition-all shadow-md"
                                        aria-label="วางสาย"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.684A1 1 0 008.279 3H5z" />
                                        </svg>
                                        <span>วางสาย</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Idle / Offline Dashboard View */}
                {!inCall && (
                    <div className="w-full max-w-5xl mx-auto flex-1 flex flex-col my-0 md:my-auto py-2 md:py-0">
                        {/* Dashboard Operations Bar / KPI Widgets */}
                        <div className="w-full grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-5">
                            {/* KPI 1: Online Volunteers */}
                            <div className="bg-[#121212] border border-white/[0.08] rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-sm relative overflow-hidden">
                                <div className="flex items-center justify-between text-xs text-zinc-400 mb-2 font-medium">
                                    <span>อาสาสมัครออนไลน์</span>
                                    <span className="relative flex h-2 w-2">
                                        {volunteerCount > 0 && (
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-vol-accent opacity-75 motion-reduce:animate-none" />
                                        )}
                                        <span className={`relative inline-flex rounded-full h-2 w-2 ${volunteerCount > 0 ? 'bg-vol-accent' : 'bg-zinc-600'}`} />
                                    </span>
                                </div>
                                <div className="flex items-baseline gap-1.5">
                                    <span className="text-3xl sm:text-4xl font-bold font-mono text-vol-accent tracking-tight">
                                        {volunteerCount}
                                    </span>
                                    <span className="text-xs text-zinc-400 font-medium">คนพร้อมช่วย</span>
                                </div>
                                <p className="text-[11px] text-zinc-500 mt-2 hidden sm:block">
                                    ระบบกระจายสายเรียกเข้าสู่อาสาสมัครทุกคนพร้อมกัน
                                </p>
                            </div>

                            {/* KPI 2: Your Standby Status */}
                            <div className="bg-[#121212] border border-white/[0.08] rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-sm">
                                <div className="text-xs text-zinc-400 mb-2 font-medium">สถานะของคุณ</div>
                                <div className="flex items-baseline gap-2 flex-wrap">
                                    <span className={`text-lg sm:text-xl font-bold tracking-tight ${online ? 'text-white' : 'text-zinc-400'}`}>
                                        {online ? 'พร้อมรับสาย' : 'ออฟไลน์'}
                                    </span>
                                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                        online
                                            ? 'bg-vol-accent/15 text-vol-accent border border-vol-accent/30'
                                            : 'bg-white/[0.06] text-zinc-400 border border-white/[0.08]'
                                    }`}>
                                        {online ? 'ONLINE' : 'STANDBY OFF'}
                                    </span>
                                </div>
                                <p className="text-[11px] text-zinc-500 mt-2 hidden sm:block">
                                    {online ? 'เปิดเสียงเตือนและ WakeLock ทำงานอยู่' : 'กดเปิดรับสายเพื่อเริ่มช่วยเหลือ'}
                                </p>
                            </div>

                            {/* KPI 3: System Health */}
                            <div className="col-span-2 md:col-span-1 bg-[#121212] border border-white/[0.08] rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-sm">
                                <div className="text-xs text-zinc-400 mb-2 font-medium">ความพร้อมของระบบ</div>
                                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                    <span>ระบบส่งสัญญาณปกติ</span>
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-zinc-500 mt-2">
                                    <span>WebRTC Live</span>
                                    <span>•</span>
                                    <span>Pusher Realtime</span>
                                </div>
                            </div>
                        </div>

                        {/* Main Operations Grid (7 cols Hero, 5 cols Guide) */}
                        <div className="w-full flex-1 flex flex-col md:grid md:grid-cols-12 gap-5 lg:gap-6 items-stretch">
                            {/* Left: Hero / Status Card (7 cols on tablet/desktop) */}
                            <section className="md:col-span-7 bg-[#121212] border border-white/[0.08] rounded-2xl p-6 sm:p-7 flex flex-col justify-between relative overflow-hidden transition-all shadow-sm">
                                {/* Subtle top hairline edge highlight when online */}
                                {online && (
                                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-vol-accent/50 to-transparent pointer-events-none" />
                                )}

                                <div>
                                    {/* Status Chip */}
                                    {online ? (
                                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-vol-accent/10 border border-vol-accent/25 text-vol-accent mb-6 self-start">
                                            <span className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-vol-accent opacity-75 motion-reduce:animate-none" />
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-vol-accent" />
                                            </span>
                                            <span>พร้อมให้ความช่วยเหลือ</span>
                                        </div>
                                    ) : (
                                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-white/[0.04] border border-white/[0.08] text-zinc-400 mb-6 self-start">
                                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                                            <span>สถานะ: ออฟไลน์</span>
                                        </div>
                                    )}

                                    {/* Icon Display */}
                                    <div
                                        className={`w-14 h-14 rounded-xl flex items-center justify-center mb-5 transition-all ${
                                            online
                                                ? 'bg-vol-accent/10 border border-vol-accent/30 text-vol-accent'
                                                : 'bg-white/[0.04] border border-white/[0.08] text-zinc-400'
                                        }`}
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="28"
                                            height="28"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="1.75"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        >
                                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                            <circle cx="12" cy="12" r="3" />
                                        </svg>
                                    </div>

                                    {/* Main Heading */}
                                    <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-2.5 [text-wrap:balance]">
                                        {online ? 'พร้อมช่วยเหลือ' : 'เริ่มเป็นอาสาสมัคร'}
                                    </h1>

                                    {/* Description */}
                                    <p className="text-zinc-400 text-sm sm:text-base leading-relaxed max-w-md">
                                        {online
                                            ? 'กำลังรอสายขอความช่วยเหลือ... ระบบจะส่งสัญญาณเตือนให้คุณทันทีเมื่อมีผู้ต้องการความช่วยเหลือ'
                                            : 'เปิดสถานะออนไลน์เพื่อเป็นดวงตาและคอยช่วยเหลือผู้พิการทางสายตาเมื่อต้องการความช่วยเหลือแบบเรียลไทม์'}
                                    </p>
                                </div>

                                {/* Action Button (In-flow inside Hero card across all screen sizes) */}
                                <div className="mt-6 pt-2">
                                    {online ? (
                                        <button
                                            type="button"
                                            onClick={goOffline}
                                            className="w-full py-3.5 px-5 rounded-xl text-base font-semibold bg-[#181818] hover:bg-[#202020] active:scale-[0.99] text-white border border-white/10 hover:border-white/20 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-vol-accent"
                                        >
                                            หยุดรับสาย
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={goOnline}
                                            className="w-full py-3.5 px-5 rounded-xl text-base font-bold bg-vol-accent hover:bg-vol-accent-hover active:scale-[0.99] text-[#090909] shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-vol-accent"
                                        >
                                            เปิดรับสาย (ออนไลน์)
                                        </button>
                                    )}
                                </div>
                            </section>

                            {/* Right: How Assistance Works (Instructional Guide, 5 cols) */}
                            <section className="md:col-span-5 bg-[#121212] border border-white/[0.08] rounded-2xl p-6 sm:p-7 flex flex-col justify-between shadow-sm">
                                <div>
                                    <div className="flex items-center gap-2 text-xs font-bold text-zinc-400 mb-5 uppercase tracking-wider">
                                        <span className="w-1.5 h-1.5 rounded-full bg-vol-accent" />
                                        <h2>การช่วยเหลือทำงานอย่างไร</h2>
                                    </div>

                                    {/* 3 Cohesive Guidance Cards (Balanced, no fake stepper) */}
                                    <div className="space-y-3">
                                        {/* Step 1 */}
                                        <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-start gap-3.5 transition-colors">
                                            <div className="w-8 h-8 rounded-lg bg-vol-accent/10 border border-vol-accent/25 flex items-center justify-center text-vol-accent shrink-0 mt-0.5">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.828a5 5 0 010-7.072m7.072 0a5 5 0 010 7.072M12 12h.01" />
                                                </svg>
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-semibold text-white mb-1">1. เปิดรับสาย</h3>
                                                <p className="text-xs text-zinc-400 leading-relaxed">
                                                    กดปุ่มเปิดรับสายเพื่อเปิดสถานะออนไลน์ ระบบจะบันทึกว่าคุณพร้อมช่วยเหลือ
                                                </p>
                                            </div>
                                        </div>

                                        {/* Step 2 */}
                                        <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-start gap-3.5 transition-colors">
                                            <div className="w-8 h-8 rounded-lg bg-vol-accent/10 border border-vol-accent/25 flex items-center justify-center text-vol-accent shrink-0 mt-0.5">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                                </svg>
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-semibold text-white mb-1">2. รับคำขอ</h3>
                                                <p className="text-xs text-zinc-400 leading-relaxed">
                                                    เมื่อมีผู้พิการทางสายตากดโทรเข้า ระบบจะส่งสัญญาณเตือนให้คุณกดรับสายทันที
                                                </p>
                                            </div>
                                        </div>

                                        {/* Step 3 */}
                                        <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-start gap-3.5 transition-colors">
                                            <div className="w-8 h-8 rounded-lg bg-vol-accent/10 border border-vol-accent/25 flex items-center justify-center text-vol-accent shrink-0 mt-0.5">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-semibold text-white mb-1">3. ดูภาพและพูดแนะนำ</h3>
                                                <p className="text-xs text-zinc-400 leading-relaxed">
                                                    ดูภาพสด ถ่ายภาพระยะชัด หรือเปิดไฟฉายช่วยส่อง พร้อมพูดคุยหรือส่งข้อความแนะนำ
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Sound Advisory Notice */}
                                <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-500">
                                    <span className="flex items-center gap-1.5">
                                        <svg className="w-3.5 h-3.5 text-vol-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                        </svg>
                                        เปิดเสียงแจ้งเตือนไว้เสมอ
                                    </span>
                                    <span className="text-vol-accent font-semibold tracking-wider">NYETA</span>
                                </div>
                            </section>
                        </div>
                        {/* Mobile bottom buffer to ensure full card clearance above browser navigation / home bar */}
                        <div className="h-10 sm:h-6 shrink-0 w-full" aria-hidden="true" />
                    </div>
                )}
            </main>

            {/* Incoming Call Overlay */}
            {incomingCall && !inCall && (
                <div
                    className="fixed inset-0 z-50 bg-black/90 backdrop-blur-2xl flex flex-col items-center justify-center p-6 text-center"
                    role="dialog"
                    aria-label="สายเรียกเข้า"
                >
                    <div className="w-24 h-24 rounded-2xl bg-vol-accent/10 border border-vol-accent/30 flex items-center justify-center mb-6 animate-pulse motion-reduce:animate-none shadow-sm">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="44"
                            height="44"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-vol-accent"
                        >
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2 tracking-tight">สายเรียกเข้า</h2>
                    <p className="text-zinc-400 mb-8 max-w-sm text-sm sm:text-base">ผู้พิการทางสายตาต้องการความช่วยเหลือ</p>
                    <div className="flex items-center gap-6">
                        <button
                            type="button"
                            onClick={() => dismissIncoming()}
                            className="w-16 h-16 rounded-2xl bg-red-600 hover:bg-red-500 active:scale-95 text-white flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 shadow-sm transition-transform"
                            aria-label="ปฏิเสธสาย"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="28"
                                height="28"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="rotate-[135deg]"
                            >
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
                            </svg>
                        </button>
                        <button
                            type="button"
                            onClick={() => acceptCall()}
                            className="w-20 h-20 rounded-2xl bg-vol-accent hover:bg-vol-accent-hover active:scale-95 text-[#090909] flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-vol-accent shadow-sm transition-transform"
                            aria-label="รับสาย"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="32"
                                height="32"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            {/* Captured Photo Viewer */}
            <ImageViewer
                imageBase64={capturedImage}
                onClose={() => setCapturedImage(null)}
            />
        </div>
    );
}
