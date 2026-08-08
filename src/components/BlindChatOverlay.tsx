'use client';

import React, { useEffect, useState, useRef } from 'react';
import speechManager, { Priority } from '@/lib/speechManager';
import { playBeep } from '@/lib/audio';

export interface BlindChatOverlayProps {
    latestMessage: { from?: string; text?: string } | null;
    onSendMessage: (text: string) => void;
}

export default function BlindChatOverlay({ latestMessage, onSendMessage }: BlindChatOverlayProps) {
    const [isListening, setIsListening] = useState<boolean>(false);
    const recognitionRef = useRef<any>(null);

    // TTS: Speak the incoming message
    useEffect(() => {
        if (latestMessage && latestMessage.from === 'volunteer') {
            const text = latestMessage.text;
            
            // Play notification sound
            playBeep(600, 0.1);
            if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
                try {
                    navigator.vibrate(100);
                } catch {}
            }

            // Speak the text
            if (text) {
                speechManager?.speak(text, {
                    priority: Priority.HIGH,
                    owner: 'volunteer-message',
                    rate: 1.0,
                });
            }
        }
    }, [latestMessage]);

    // Setup Speech Recognition
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (SpeechRecognition) {
                const recognition = new SpeechRecognition();
                recognition.lang = 'th-TH';
                recognition.continuous = false;
                recognition.interimResults = false;
                
                recognition.onstart = () => setIsListening(true);
                
                recognition.onresult = (event: any) => {
                    const transcript = event.results[0][0].transcript;
                    if (transcript && transcript.trim()) {
                        onSendMessage(transcript.trim());
                    }
                };
                
                recognition.onerror = (event: any) => {
                    console.error('Speech recognition error', event.error);
                    setIsListening(false);
                };
                
                recognition.onend = () => {
                    setIsListening(false);
                };
                
                recognitionRef.current = recognition;
            }
        }
    }, [onSendMessage]);

    const startListening = () => {
        if (recognitionRef.current && !isListening) {
            // Play mic start sound
            playBeep(800, 0.1);
            if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
                try {
                    navigator.vibrate([50, 50, 50]);
                } catch {}
            }
            try {
                recognitionRef.current.start();
            } catch (e) {
                console.error(e);
            }
        }
    };

    const stopListening = () => {
        if (recognitionRef.current && isListening) {
            recognitionRef.current.stop();
        }
    };

    if (!latestMessage) return null;

    return (
        <div 
            className="absolute top-20 left-4 right-4 z-40"
            aria-live="assertive"
        >
            {latestMessage.from === 'volunteer' && (
                <div className="bg-black/80 backdrop-blur-md rounded-2xl p-4 shadow-2xl border-2 border-yellow-400/50">
                    <p className="text-2xl font-bold text-yellow-400 mb-1">อาสาสมัคร:</p>
                    <p className="text-3xl text-white font-medium leading-tight">{latestMessage.text}</p>
                </div>
            )}
            
            <button
                className={`fixed bottom-40 left-1/2 -translate-x-1/2 rounded-full p-6 shadow-2xl transition-all ${
                    isListening ? 'bg-red-500 scale-110' : 'bg-gray-800/80 hover:bg-gray-700'
                }`}
                onPointerDown={startListening}
                onPointerUp={stopListening}
                onPointerLeave={stopListening}
                aria-label="กดค้างเพื่อพูดตอบ"
            >
                <svg className={`w-12 h-12 ${isListening ? 'text-white' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                {isListening && (
                    <span className="absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap bg-red-600 text-white px-4 py-2 rounded-full text-xl font-bold">
                        กำลังฟัง...
                    </span>
                )}
            </button>
        </div>
    );
}
