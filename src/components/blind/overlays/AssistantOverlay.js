import { mapBboxToOverlay } from '@/lib/videoCoords';
import OverlayBox from './OverlayBox';

const COCO_COLORS = {
    book: '#a78bfa',
    person: '#38bdf8',
    default: '#22d3ee',
};

function getCocoColor(className) {
    return COCO_COLORS[className] || COCO_COLORS.default;
}

export default function AssistantOverlay({ cocoBoxes, video, container }) {
    if (!cocoBoxes || cocoBoxes.length === 0) return null;

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
                        label={`${box.class}${box.score ? ` ${Math.round(box.score * 100)}%` : ''}`}
                        thick={isPrimary}
                        pulse={isPrimary && style.width > 8}
                    />
                );
            })}
        </>
    );
}
