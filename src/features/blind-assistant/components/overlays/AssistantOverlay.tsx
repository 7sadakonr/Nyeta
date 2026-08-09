import React from 'react';
import { mapBboxToOverlay } from '@/features/blind-assistant/client/videoCoords';
import OverlayBox from './OverlayBox';
import { DetectedObject } from '@/features/blind-assistant/types/assistant';
import { getObjectLabel } from '@/features/blind-assistant/client/objectLabels';

const COCO_COLORS: Record<string, string> = {
    book: '#a78bfa',
    person: '#38bdf8',
    default: '#22d3ee',
};

function getCocoColor(className: string): string {
    return COCO_COLORS[className] || COCO_COLORS.default;
}

export interface AssistantOverlayProps {
    cocoBoxes: DetectedObject[];
    video: HTMLVideoElement | null;
    container: HTMLElement | null;
}

export default function AssistantOverlay({ cocoBoxes, video, container }: AssistantOverlayProps) {
    if (!cocoBoxes || cocoBoxes.length === 0 || !video || !container) return null;

    return (
        <>
            {cocoBoxes.map((box, i) => {
                const style = mapBboxToOverlay(box.bbox, video, container);
                if (!style) return null;
                const isPrimary = i === 0;
                return (
                    <OverlayBox
                        key={`coco-${box.class}-${i}`}
                        style={style}
                        color={getCocoColor(box.class)}
                        label={`${getObjectLabel(box.class)}${box.score ? ` ${Math.round(box.score * 100)}%` : ''}`}
                        thick={isPrimary}
                        pulse={isPrimary && style.width > 8}
                    />
                );
            })}
        </>
    );
}
