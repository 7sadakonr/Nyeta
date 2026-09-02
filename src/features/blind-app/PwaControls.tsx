'use client';

import { useEffect, useRef, useState } from 'react';
import { speechController } from '@/shared/accessibility/speechController';

interface DeferredInstallPrompt extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PwaControls({ callActive, audioReady }: { callActive: boolean; audioReady: boolean }) {
    const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
    const [installPrompt, setInstallPrompt] = useState<DeferredInstallPrompt | null>(null);
    const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
    const [showIosInstall, setShowIosInstall] = useState(() => {
        if (typeof window === 'undefined') return false;
        if (sessionStorage.getItem('hide_pwa_prompt') === 'true') return false;
        const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
        return isIos && !isStandalone;
    });

    const dismissIosPrompt = () => {
        sessionStorage.setItem('hide_pwa_prompt', 'true');
        setShowIosInstall(false);
    };
    const explicitUpdateRef = useRef(false);

    useEffect(() => {
        const onOnline = () => {
            setOnline(true);
            if (audioReady) speechController.speak('กลับมาออนไลน์แล้ว', { channel: 'status' });
        };
        const onOffline = () => {
            setOnline(false);
            if (audioReady) speechController.speak('ขณะนี้ออฟไลน์ ฟังก์ชัน AI และการโทรใช้งานไม่ได้', { channel: 'critical' });
        };
        const onBeforeInstallPrompt = (event: Event) => {
            event.preventDefault();
            setInstallPrompt(event as DeferredInstallPrompt);
        };
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);
        window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
        return () => {
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
            window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
        };
    }, [audioReady]);

    useEffect(() => {
        if (!audioReady || online) return;
        speechController.speak('ขณะนี้ออฟไลน์ ฟังก์ชัน AI และการโทรใช้งานไม่ได้', { channel: 'critical' });
    }, [audioReady, online]);

    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;
        let registration: ServiceWorkerRegistration | undefined;
        const onControllerChange = () => {
            if (explicitUpdateRef.current && !callActive) window.location.reload();
        };
        navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((result) => {
            registration = result;
            if (result.waiting) setWaitingWorker(result.waiting);
            result.addEventListener('updatefound', () => {
                const installing = result.installing;
                installing?.addEventListener('statechange', () => {
                    if (installing.state === 'installed' && navigator.serviceWorker.controller) setWaitingWorker(result.waiting);
                });
            });
        }).catch(() => {});
        return () => {
            navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
            void registration;
        };
    }, [callActive]);

    const install = async () => {
        if (!installPrompt) return;
        await installPrompt.prompt();
        await installPrompt.userChoice;
        setInstallPrompt(null);
    };

    const applyUpdate = () => {
        if (callActive || !waitingWorker) return;
        explicitUpdateRef.current = true;
        waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    };

    return (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-50 mx-auto flex w-full max-w-xl flex-col items-center gap-2 px-4">
            {!online && <p className="pointer-events-auto rounded-full bg-[#0F172A] px-4 py-2 text-center text-sm font-semibold text-white" aria-label="สถานะเครือข่าย: ออฟไลน์">ออฟไลน์ — AI และการโทรต้องใช้อินเทอร์เน็ต</p>}
            {installPrompt && <button type="button" onClick={install} className="pointer-events-auto rounded-full bg-[#1D4ED8] px-4 py-2 text-sm font-bold text-white">ติดตั้ง Nyeta</button>}
            {showIosInstall && (
                <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow">
                    <p className="text-center text-sm font-semibold text-[#0F172A]">บน iPhone: กด Share แล้วเลือก Add to Home Screen</p>
                    <button type="button" onClick={dismissIosPrompt} className="ml-2 px-2 text-gray-500 font-bold" aria-label="ปิดแถบแจ้งเตือนชั่วคราว">X</button>
                </div>
            )}
            {waitingWorker && <button type="button" disabled={callActive} onClick={applyUpdate} className="pointer-events-auto rounded-full bg-[#0F172A] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{callActive ? 'วางสายก่อนอัปเดต' : 'มีเวอร์ชันใหม่'}</button>}
        </div>
    );
}
