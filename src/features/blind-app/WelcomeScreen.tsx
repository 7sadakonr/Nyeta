'use client';

import { useState } from 'react';
import { speechController } from '@/shared/accessibility/speechController';

interface WelcomeScreenProps {
    onStart: () => void;
}

export default function WelcomeScreen({ onStart }: WelcomeScreenProps) {
    const [isRequesting, setIsRequesting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleStart = async () => {
        if (isRequesting) return;
        setIsRequesting(true);
        setError(null);
        
        speechController.unlockAudio();
        speechController.speak('กำลังเตรียมความพร้อม กรุณารอสักครู่', { channel: 'status' });

        try {
            // Request camera and microphone permissions upfront
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment' }, 
                audio: true 
            });
            
            // Release the devices immediately so the actual app hooks can claim them
            stream.getTracks().forEach(track => track.stop());
            
            speechController.speak('อนุญาตสำเร็จ กำลังเข้าสู่แอป', { channel: 'status' });
            
            // Slight delay so the user hears the success message before the heavy app mounts
            setTimeout(() => {
                onStart();
            }, 600);
        } catch (err) {
            console.error('Permission denied:', err);
            const msg = 'ไม่สามารถเข้าถึงกล้องหรือไมโครโฟนได้ กรุณาอนุญาตในการตั้งค่าเบราว์เซอร์ แล้วลองใหม่อีกครั้งครับ';
            setError(msg);
            speechController.speak(msg, { channel: 'critical' });
            setIsRequesting(false);
        }
    };

    return (
        <div 
            className="flex h-screen w-full flex-col items-center justify-center bg-[#000000] p-6 text-white"
            onClick={() => speechController.unlockAudio()}
            onTouchStart={() => speechController.unlockAudio()}
        >
            <div className="mb-12 text-center">
                <h1 className="mb-4 text-5xl font-black text-sky-400">Nyeta</h1>
                <p className="text-xl font-medium text-gray-300">ผู้ช่วย AI สำหรับผู้พิการทางสายตา</p>
            </div>
            
            <button
                onClick={handleStart}
                disabled={isRequesting}
                className="w-full max-w-sm rounded-full bg-sky-500 py-6 text-3xl font-bold shadow-xl shadow-sky-500/20 active:scale-95 disabled:opacity-50 transition-transform"
                aria-label="เริ่มใช้งาน และอนุญาตกล้อง"
            >
                {isRequesting ? 'กำลังขออนุญาต...' : 'เริ่มใช้งาน'}
            </button>

            {error && (
                <p className="mt-8 text-center text-lg font-semibold text-red-400" role="alert" aria-live="assertive">
                    {error}
                </p>
            )}
        </div>
    );
}
