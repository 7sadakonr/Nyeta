'use client';

import React, { useEffect, useRef } from 'react';
import { speechController } from '@/shared/accessibility/speechController';
import { playBeep } from '@/shared/accessibility/audio';

export interface BlindChatOverlayProps {
    latestMessage: { from?: string; text?: string } | null;
    onSendMessage?: (text: string) => void;
    audioReady?: boolean;
}

export default function BlindChatOverlay({ latestMessage, audioReady = false }: BlindChatOverlayProps) {
    const lastHandledMessageRef = useRef<{ from?: string; text?: string } | null>(null);

    // TTS: Speak the incoming message from the volunteer
    useEffect(() => {
        if (latestMessage === lastHandledMessageRef.current) return;
        lastHandledMessageRef.current = latestMessage;
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
            if (audioReady && text) {
                speechController.speak(text, {
                    channel: 'result',
                });
            }
        }
    }, [audioReady, latestMessage]);

    if (!latestMessage) return null;

    return (
        <div className="absolute top-20 left-4 right-4 z-40">
            {latestMessage.from === 'volunteer' && (
                <div className="bg-[#090909]/80 backdrop-blur-md rounded-2xl p-4 shadow-2xl border-2 border-yellow-400/50">
                    <p className="text-2xl font-bold text-yellow-400 mb-1">อาสาสมัคร:</p>
                    <p className="text-3xl text-white font-medium leading-tight">{latestMessage.text}</p>
                </div>
            )}
        </div>
    );
}
