'use client';

import { useEffect, useState } from 'react';
import { mapBboxToOverlay, mapRectToOverlay, mapPointToOverlay, getCurrencyScanRegion } from '@/lib/videoCoords';

const COCO_COLORS = {
    book: '#a78bfa',
    person: '#38bdf8',
    default: '#22d3ee',
};

const CURRENCY_COLORS = {
    note: '#4ade80',
    coin: '#38bdf8',
    default: '#fbbf24',
};

function getCocoColor(className) {
    return COCO_COLORS[className] || COCO_COLORS.default;
}

function getCurrencyColor(type) {
    return CURRENCY_COLORS[type] || CURRENCY_COLORS.default;
}

function formatCurrencyBoxLabel(box) {
    if (box.label) return box.label;
    if (box.type === 'coin') return `เหรียญ ${box.value}`;
    return `ธนบัตร ${box.value}`;
}

function OverlayBox({ style, color, dashed, label, thick, pulse }) {
    return (
        <div
            className={`absolute pointer-events-none box-border ${pulse ? 'animate-pulse' : ''}`}
            style={{
                left: `${style.left}%`,
                top: `${style.top}%`,
                width: `${style.width}%`,
                height: `${style.height}%`,
                border: `${thick ? 3 : 2}px ${dashed ? 'dashed' : 'solid'} ${color}`,
                borderRadius: dashed ? 4 : 2,
                boxShadow: `0 0 8px ${color}66`,
            }}
        >
            {label && (
                <span
                    className="absolute -top-6 left-0 px-2 py-0.5 text-xs font-bold rounded whitespace-nowrap"
                    style={{ backgroundColor: `${color}cc`, color: '#000' }}
                >
                    {label}
                </span>
            )}
        </div>
    );
}

function PagePolygon({ corners, video, container, aligned }) {
    if (!corners) return null;

    const tl = mapPointToOverlay(corners.tl, video, container);
    const tr = mapPointToOverlay(corners.tr, video, container);
    const br = mapPointToOverlay(corners.br, video, container);
    const bl = mapPointToOverlay(corners.bl, video, container);

    if (!tl || !tr || !br || !bl) return null;

    const color = aligned ? '#4ade80' : '#c084fc';
    const points = `${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`;

    return (
        <svg className="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polygon
                points={points}
                fill={aligned ? 'rgba(74,222,128,0.12)' : 'rgba(192,132,252,0.08)'}
                stroke={color}
                strokeWidth="0.6"
                strokeDasharray={aligned ? 'none' : '1.5 1'}
                vectorEffect="non-scaling-stroke"
            />
            {[tl, tr, br, bl].map((pt, i) => (
                <circle
                    key={i}
                    cx={pt.x}
                    cy={pt.y}
                    r="0.8"
                    fill={color}
                    stroke="#fff"
                    strokeWidth="0.2"
                />
            ))}
        </svg>
    );
}

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
}) {
    const [, setResizeTick] = useState(0);

    useEffect(() => {
        const container = containerRef?.current;
        if (!container) return undefined;

        const observer = new ResizeObserver(() => setResizeTick((t) => t + 1));
        observer.observe(container);
        const onResize = () => setResizeTick((t) => t + 1);
        window.addEventListener('resize', onResize);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', onResize);
        };
    }, [containerRef]);

    const video = videoRef?.current;
    const container = containerRef?.current;
    if (!video || !container) return null;

    const currencyScanRegion = showCurrency ? getCurrencyScanRegion(video) : null;
    const currencyScanStyle = currencyScanRegion
        ? mapRectToOverlay(currencyScanRegion, video, container)
        : null;
    const currencyNoteStyle = currencyBounds
        ? mapRectToOverlay(currencyBounds, video, container)
        : null;
    const pageStyle = !pageCorners && pageBounds ? mapRectToOverlay(pageBounds, video, container) : null;

    return (
        <div className="absolute inset-0 pointer-events-none z-10" aria-hidden="true">
            {/* Center crosshair guide */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 border border-white/40 rounded-full opacity-40" />
            <div className="absolute left-0 right-0 top-1/2 h-px bg-white/15" />
            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/15" />

            {/* Target guide for document alignment (reader mode) */}
            {showPage && (
                <OverlayBox
                    style={{ left: 10, top: 10, width: 80, height: 80 }}
                    color={pageAligned ? '#4ade80' : 'rgba(255,255,255,0.35)'}
                    dashed={!pageAligned}
                    label={pageAligned ? 'พร้อมถ่าย' : 'กรอบเป้าหมาย'}
                />
            )}

            {/* COCO-SSD bounding boxes */}
            {showCoco && cocoBoxes.map((box, i) => {
                const style = mapBboxToOverlay(box.bbox, video, container);
                if (!style) return null;
                const isPrimary = i === 0;
                return (
                    <OverlayBox
                        key={`coco-${box.class}-${i}`}
                        style={style}
                        color={getCocoColor(box.class)}
                        label={`${box.class}${box.score ? ` ${Math.round(box.score * 100)}%` : ''}`}
                        thick={isPrimary}
                        pulse={isPrimary && style.width > 8}
                    />
                );
            })}

            {/* Document page polygon from 4 corners */}
            {showPage && pageCorners && (
                <PagePolygon
                    corners={pageCorners}
                    video={video}
                    container={container}
                    aligned={pageAligned}
                />
            )}

            {/* Fallback axis-aligned page frame */}
            {showPage && !pageCorners && pageStyle && (
                <OverlayBox
                    style={pageStyle}
                    color="#c084fc"
                    dashed
                    thick
                    label="ขอบกระดาษ"
                    pulse={pageStyle.width > 15 && pageStyle.height > 15}
                />
            )}

            {/* Currency detection boxes (model or color fallback) */}
            {showCurrency && currencyBoxes.map((box, i) => {
                const bbox = box.bbox || (box.bounds
                    ? [box.bounds.x, box.bounds.y, box.bounds.width, box.bounds.height]
                    : null);
                if (!bbox) return null;

                const style = mapBboxToOverlay(bbox, video, container);
                if (!style) return null;

                const isPrimary = i === 0;
                const color = getCurrencyColor(box.type);
                const confidence = box.confidence ?? box.score;

                return (
                    <OverlayBox
                        key={`currency-box-${box.type}-${box.value}-${i}`}
                        style={style}
                        color={color}
                        label={`${formatCurrencyBoxLabel(box)}${confidence ? ` ${Math.round(confidence * 100)}%` : ''}`}
                        thick={isPrimary}
                        pulse={isPrimary && currencyDetected}
                    />
                );
            })}

            {/* Currency scan zone */}
            {showCurrency && currencyScanStyle && (
                <OverlayBox
                    style={currencyScanStyle}
                    color={currencyDetected ? '#4ade80' : '#fbbf24'}
                    dashed={!currencyDetected}
                    thick
                    label={currencyDetected ? 'ตรวจพบเงิน' : 'โซนสแกนเงิน'}
                    pulse={currencyDetected}
                />
            )}

            {showCurrency && currencyNoteStyle && currencyDetected && currencyBoxes.length === 0 && (
                <OverlayBox
                    style={currencyNoteStyle}
                    color="#4ade80"
                    label="พื้นที่ธนบัตร"
                />
            )}
        </div>
    );
}
