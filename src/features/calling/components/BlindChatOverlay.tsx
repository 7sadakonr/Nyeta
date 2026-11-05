'use client';

import React, { useEffect, useRef } from 'react';
import { announce } from '@/shared/accessibility/announcer';
import { playBeep } from '@/shared/accessibility/audio';

export interface BlindChatOverlayProps {
    latestMessage: { from?: string; text?: string } | null;
}

// The blind user talks to the volunteer over the call audio, so there is no reply control here: this only shows
// and announces what the volunteer types.
export default function BlindChatOverlay({ latestMessage }: BlindChatOverlayProps) {
    const lastHandledMessageRef = useRef<{ from?: string; text?: string } | null>(null);

    // Incoming volunteer messages are announced through the live region: VoiceOver queues them behind what it is
    // already reading, whereas speech synthesis was dropped during the quiet window.
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

    if (latestMessage?.from !== 'volunteer') return null;

    return (
        <div className="absolute top-20 left-4 right-4 z-40">
            <div className="bg-[#090909]/80 backdrop-blur-md rounded-2xl p-4 shadow-2xl border-2 border-yellow-400/50">
                <p className="text-2xl font-bold text-yellow-400 mb-1">อาสาสมัคร:</p>
                <p className="text-3xl text-white font-medium leading-tight">{latestMessage.text}</p>
            </div>
        </div>
    );
}
