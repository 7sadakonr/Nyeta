'use client';

import React, { useCallback, useEffect, useState, useRef } from 'react';
import { speechController } from '@/shared/accessibility/speechController';
import { announce } from '@/shared/accessibility/announcer';
import { playBeep } from '@/shared/accessibility/audio';

export interface BlindChatOverlayProps {
    latestMessage: { from?: string; text?: string } | null;
    onSendMessage: (text: string) => void;
    audioReady?: boolean;
}

export default function BlindChatOverlay({ latestMessage, onSendMessage }: BlindChatOverlayProps) {
    const [isListening, setIsListening] = useState<boolean>(false);
    const recognitionRef = useRef<any>(null);
    const lastHandledMessageRef = useRef<{ from?: string; text?: string } | null>(null);
    const onSendMessageRef = useRef(onSendMessage);
    const heardSomethingRef = useRef(false);

    useEffect(() => { onSendMessageRef.current = onSendMessage; }, [onSendMessage]);

    // Incoming volunteer messages are announced through the live region: VoiceOver queues them behind what it is
    // already reading, whereas speech synthesis was dropped during the quiet window and while the microphone was open.
    useEffect(() => {
        if (latestMessage === lastHandledMessageRef.current) return;
        lastHandledMessageRef.current = latestMessage;
        if (latestMessage && latestMessage.from === 'volunteer') {
            playBeep(600, 0.1);
            if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
                try {
                    navigator.vibrate(100);
                } catch {}
            }
            if (latestMessage.text) announce(`อาสาสมัครพิมพ์ว่า ${latestMessage.text}`);
        }
    }, [latestMessage]);

    // Speech recognition: one tap to start, one tap to stop and send (VoiceOver cannot press and hold).
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        const recognition = new SpeechRecognition();
        recognition.lang = 'th-TH';
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onstart = () => {
            heardSomethingRef.current = false;
            setIsListening(true);
        };
        recognition.onresult = (event: any) => {
            const transcript = event.results[0]?.[0]?.transcript;
            if (transcript && transcript.trim()) {
                heardSomethingRef.current = true;
                onSendMessageRef.current(transcript.trim());
                announce('ส่งข้อความถึงอาสาสมัครแล้ว');
            }
        };
        recognition.onerror = (event: any) => {
            console.error('Speech recognition error', event.error);
            setIsListening(false);
            speechController.endListening();
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                announce('ไมโครโฟนใช้ไม่ได้ กรุณาอนุญาตการใช้ไมโครโฟน');
            }
        };
        recognition.onend = () => {
            setIsListening(false);
            speechController.endListening();
            if (!heardSomethingRef.current) announce('ไม่ได้ยินข้อความ ลองกดพูดตอบอีกครั้ง');
            heardSomethingRef.current = false;
        };

        recognitionRef.current = recognition;
        return () => {
            try { recognition.abort(); } catch {}
            recognitionRef.current = null;
            speechController.endListening();
        };
    }, []);

    const toggleListening = useCallback(() => {
        const recognition = recognitionRef.current;
        if (!recognition) {
            announce('อุปกรณ์นี้ไม่รองรับการพูดตอบ ใช้การโทรเพื่อพูดคุยได้');
            return;
        }
        if (isListening) {
            try { recognition.stop(); } catch {}
            return;
        }
        playBeep(800, 0.1);
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            try {
                navigator.vibrate([50, 50, 50]);
            } catch {}
        }
        speechController.beginListening();
        try {
            recognition.start();
        } catch (e) {
            speechController.endListening();
            console.error(e);
        }
    }, [isListening]);

    return (
        <div className="absolute top-20 left-4 right-4 z-40">
            {latestMessage?.from === 'volunteer' && (
                <div className="bg-[#090909]/80 backdrop-blur-md rounded-2xl p-4 shadow-2xl border-2 border-yellow-400/50">
                    <p className="text-2xl font-bold text-yellow-400 mb-1">อาสาสมัคร:</p>
                    <p className="text-3xl text-white font-medium leading-tight">{latestMessage.text}</p>
                </div>
            )}

            {/* Available from the moment the call connects, not only after the volunteer wrote something. */}
            <button
                type="button"
                className={`fixed bottom-40 left-1/2 -translate-x-1/2 flex min-h-[4.5rem] min-w-[4.5rem] items-center justify-center rounded-full p-5 shadow-2xl transition-all ${
                    isListening ? 'bg-red-500 scale-110' : 'bg-gray-800/80 hover:bg-gray-700'
                }`}
                onClick={toggleListening}
                aria-label={isListening ? 'หยุดและส่งข้อความตอบ' : 'พูดตอบอาสาสมัคร'}
            >
                <svg aria-hidden="true" className={`w-12 h-12 ${isListening ? 'text-white' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                {isListening && (
                    <span aria-hidden="true" className="absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap bg-red-600 text-white px-4 py-2 rounded-full text-xl font-bold">
                        กำลังฟัง...
                    </span>
                )}
            </button>
        </div>
    );
}
