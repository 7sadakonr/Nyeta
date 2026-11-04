'use client';

import { useEffect, useState } from 'react';

/**
 * Screen-reader announcements through DOM live regions.
 *
 * VoiceOver users hear status and confirmations best from VoiceOver itself: it queues them behind whatever it is
 * already reading, so nothing is cut off or dropped. TTS stays reserved for continuous camera guidance and urgent
 * warnings (see speechController). Both regions are mounted once at startup so iOS has registered them before the
 * first message arrives.
 */

type Politeness = 'polite' | 'assertive';
type Listener = (text: string) => void;

const listeners: Record<Politeness, Set<Listener>> = {
    polite: new Set(),
    assertive: new Set(),
};

/** Announce `text` to assistive technology. Use `assertive` only for things that must interrupt. */
export function announce(text: string, options: { assertive?: boolean } = {}): void {
    if (!text) return;
    listeners[options.assertive ? 'assertive' : 'polite'].forEach((listener) => listener(text));
}

// Re-announcing identical text only works if the region changes, so it is cleared first and refilled a moment later.
const REFILL_DELAY_MS = 60;

function LiveRegion({ politeness }: { politeness: Politeness }) {
    const [text, setText] = useState('');

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const listener: Listener = (next) => {
            if (timer) clearTimeout(timer);
            setText('');
            timer = setTimeout(() => setText(next), REFILL_DELAY_MS);
        };
        listeners[politeness].add(listener);
        return () => {
            listeners[politeness].delete(listener);
            if (timer) clearTimeout(timer);
        };
    }, [politeness]);

    return (
        <div
            role={politeness === 'assertive' ? 'alert' : 'status'}
            aria-live={politeness}
            aria-atomic="true"
            className="sr-only"
        >
            {text}
        </div>
    );
}

export function LiveAnnouncer() {
    return (
        <>
            <LiveRegion politeness="polite" />
            <LiveRegion politeness="assertive" />
        </>
    );
}
