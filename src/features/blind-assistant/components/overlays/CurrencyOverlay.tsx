import React from 'react';
import { mapBboxToOverlay, mapRectToOverlay, getCurrencyScanRegion } from '@/features/blind-assistant/client/videoCoords';
import OverlayBox from './OverlayBox';
import { BoundingBox } from '@/features/blind-assistant/types/assistant';

const CURRENCY_COLORS: Record<string, string> = {
    note: '#4ade80',
    coin: '#3ba7ff',
    default: '#6fe8ff',
};

function getCurrencyColor(type: string): string {
    return CURRENCY_COLORS[type] || CURRENCY_COLORS.default;
}

function formatCurrencyBoxLabel(box: any): string {
    if (box.label) return box.label;
    if (box.type === 'coin') return `เหรียญ ${box.value}`;
    return `ธนบัตร ${box.value}`;
}

export interface CurrencyOverlayProps {
    currencyBoxes?: any[];
    currencyBounds: BoundingBox | null;
    currencyDetected: boolean;
    isBlocked: boolean;
    video: HTMLVideoElement | null;
    container: HTMLElement | null;
}

export default function CurrencyOverlay({
    currencyBoxes,
    currencyBounds,
    currencyDetected,
    isBlocked,
    video,
    container,
}: CurrencyOverlayProps) {
    if (!video || !container) return null;

    const currencyScanRegion = getCurrencyScanRegion(video);
    const currencyScanStyle = currencyScanRegion
        ? mapRectToOverlay(currencyScanRegion, video, container)
        : null;
    const currencyNoteStyle = currencyBounds
        ? mapRectToOverlay(currencyBounds, video, container)
        : null;

    return (
        <>
            {/* Currency detection boxes (model or color fallback) */}
            {currencyBoxes && currencyBoxes.map((box, i) => {
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
            {currencyScanStyle && (
                <OverlayBox
                    style={currencyScanStyle}
                    color={isBlocked ? '#FF5D6C' : currencyDetected ? '#4ADE80' : '#6FE8FF'}
                    dashed={!currencyDetected && !isBlocked}
                    thick
                    label={isBlocked ? '⚠️ กล้องโดนบัง' : currencyDetected ? 'ตรวจพบเงิน' : 'โซนสแกนเงิน'}
                    pulse={currencyDetected || isBlocked}
                />
            )}

            {currencyNoteStyle && currencyDetected && (!currencyBoxes || currencyBoxes.length === 0) && (
                <OverlayBox
                    style={currencyNoteStyle}
                    color="#4ade80"
                    label="พื้นที่ธนบัตร"
                />
            )}
        </>
    );
}
