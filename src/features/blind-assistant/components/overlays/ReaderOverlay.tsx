import React from 'react';
import { mapPointToOverlay, mapRectToOverlay } from '@/features/blind-assistant/client/videoCoords';
import OverlayBox from './OverlayBox';
import { BoundingBox, QuadCorners } from '@/features/blind-assistant/types/assistant';

export interface ReaderOverlayProps {
    pageCorners: QuadCorners | null;
    pageBounds: BoundingBox | null;
    pageAligned: boolean;
    video: HTMLVideoElement | null;
    container: HTMLElement | null;
}

export default function ReaderOverlay({ pageCorners, pageBounds, pageAligned, video, container }: ReaderOverlayProps) {
    if (!video || !container) return null;

    const pageStyle = !pageCorners && pageBounds ? mapRectToOverlay(pageBounds, video, container) : null;

    return (
        <>
            {/* Target guide for document alignment */}
            <OverlayBox
                style={{ left: 10, top: 10, width: 80, height: 80 }}
                color={pageAligned ? '#4ade80' : 'rgba(255,255,255,0.35)'}
                dashed={!pageAligned}
                label={pageAligned ? 'พร้อมถ่าย' : 'กรอบเป้าหมาย'}
            />

            {/* Document page polygon from 4 corners */}
            {pageCorners && (
                <PagePolygon
                    corners={pageCorners}
                    video={video}
                    container={container}
                    aligned={pageAligned}
                />
            )}

            {/* Fallback axis-aligned page frame */}
            {!pageCorners && pageStyle && (
                <OverlayBox
                    style={pageStyle}
                    color="#6FE8FF"
                    dashed
                    thick
                    label="ขอบกระดาษ"
                    pulse={pageStyle.width > 15 && pageStyle.height > 15}
                />
            )}
        </>
    );
}

function PagePolygon({
    corners,
    video,
    container,
    aligned,
}: {
    corners: QuadCorners | null;
    video: HTMLVideoElement | null;
    container: HTMLElement | null;
    aligned: boolean;
}) {
    if (!corners || !video || !container) return null;

    const tl = mapPointToOverlay(corners.tl, video, container);
    const tr = mapPointToOverlay(corners.tr, video, container);
    const br = mapPointToOverlay(corners.br, video, container);
    const bl = mapPointToOverlay(corners.bl, video, container);

    if (!tl || !tr || !br || !bl) return null;

    const color = aligned ? '#4ade80' : '#6FE8FF';
    const points = `${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`;

    return (
        <svg className="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polygon
                points={points}
                fill={aligned ? 'rgba(74,222,128,0.12)' : 'rgba(111,232,255,0.08)'}
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
