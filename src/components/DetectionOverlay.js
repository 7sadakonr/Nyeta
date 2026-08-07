'use client';

import { useEffect, useState } from 'react';
import AssistantOverlay from './blind/overlays/AssistantOverlay';
import ReaderOverlay from './blind/overlays/ReaderOverlay';
import CurrencyOverlay from './blind/overlays/CurrencyOverlay';

export default function DetectionOverlay({
    videoRef,
    containerRef,
    cocoBoxes = [],
    pageBounds = null,
    pageCorners = null,
    pageAligned = false,
    currencyBounds = null,
    currencyBoxes = [],
    mode = 'assistant',
    showCoco = true,
    showPage = false,
    showCurrency = false,
    currencyDetected = false,
    currencyBlocked = false,
}) {
    const [elements, setElements] = useState({ video: null, container: null });

    useEffect(() => {
        const updateElements = () => {
            const video = videoRef?.current || null;
            const container = containerRef?.current || null;
            setElements({ video, container });
        };

        updateElements();

        const container = containerRef?.current;
        if (!container) return undefined;

        const observer = new ResizeObserver(updateElements);
        observer.observe(container);
        window.addEventListener('resize', updateElements);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateElements);
        };
    }, [containerRef, videoRef]);

    const { video, container } = elements;
    if (!video || !container) return null;

    return (
        <div className="absolute inset-0 pointer-events-none z-10" aria-hidden="true">
            {/* Center crosshair guide (Always visible for orientation) */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 border border-white/40 rounded-full opacity-40" />
            <div className="absolute left-0 right-0 top-1/2 h-px bg-white/15" />
            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/15" />

            {/* Render overlay elements based on active mode only to prevent combining */}
            {mode === 'assistant' && showCoco && (
                <AssistantOverlay
                    cocoBoxes={cocoBoxes}
                    video={video}
                    container={container}
                />
            )}

            {mode === 'reader' && showPage && (
                <ReaderOverlay
                    pageCorners={pageCorners}
                    pageBounds={pageBounds}
                    pageAligned={pageAligned}
                    video={video}
                    container={container}
                />
            )}

            {mode === 'currency' && showCurrency && (
                <CurrencyOverlay
                    currencyBoxes={currencyBoxes}
                    currencyBounds={currencyBounds}
                    currencyDetected={currencyDetected}
                    isBlocked={currencyBlocked}
                    video={video}
                    container={container}
                />
            )}
        </div>
    );
}
