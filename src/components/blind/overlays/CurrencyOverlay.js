import { mapBboxToOverlay, mapRectToOverlay, getCurrencyScanRegion } from '@/lib/videoCoords';
import OverlayBox from './OverlayBox';

const CURRENCY_COLORS = {
    note: '#4ade80',
    coin: '#38bdf8',
    default: '#fbbf24',
};

function getCurrencyColor(type) {
    return CURRENCY_COLORS[type] || CURRENCY_COLORS.default;
}

function formatCurrencyBoxLabel(box) {
    if (box.label) return box.label;
    if (box.type === 'coin') return `เหรียญ ${box.value}`;
    return `ธนบัตร ${box.value}`;
}

export default function CurrencyOverlay({ currencyBoxes, currencyBounds, currencyDetected, video, container }) {
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
                    color={currencyDetected ? '#4ade80' : '#fbbf24'}
                    dashed={!currencyDetected}
                    thick
                    label={currencyDetected ? 'ตรวจพบเงิน' : 'โซนสแกนเงิน'}
                    pulse={currencyDetected}
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
