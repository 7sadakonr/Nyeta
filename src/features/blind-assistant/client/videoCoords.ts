import { BoundingBox, Point2D } from '@/features/blind-assistant/types/assistant';

interface CoverTransform {
    cw: number;
    ch: number;
    scaleX: number;
    scaleY: number;
    offsetX: number;
    offsetY: number;
}

export interface OverlayBox {
    left: number;
    top: number;
    width: number;
    height: number;
}

export type OverlayRect = OverlayBox;

function getVideoCoverTransform(
    videoEl: HTMLVideoElement | null,
    containerEl: HTMLElement | null
): CoverTransform | null {
    if (!videoEl || !containerEl) return null;

    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;
    if (!vw || !vh) return null;

    const cw = containerEl.clientWidth;
    const ch = containerEl.clientHeight;
    if (!cw || !ch) return null;

    const videoRatio = vw / vh;
    const containerRatio = cw / ch;

    let renderedW: number;
    let renderedH: number;
    let offsetX: number;
    let offsetY: number;

    if (videoRatio > containerRatio) {
        renderedH = ch;
        renderedW = ch * videoRatio;
        offsetX = (cw - renderedW) / 2;
        offsetY = 0;
    } else {
        renderedW = cw;
        renderedH = cw / videoRatio;
        offsetX = 0;
        offsetY = (ch - renderedH) / 2;
    }

    return {
        cw,
        ch,
        scaleX: renderedW / vw,
        scaleY: renderedH / vh,
        offsetX,
        offsetY,
    };
}

/**
 * Map video-space bounding boxes to overlay percentages for object-cover video.
 */
export function mapBboxToOverlay(
    bbox: [number, number, number, number] | null | undefined,
    videoEl: HTMLVideoElement | null,
    containerEl: HTMLElement | null
): OverlayBox | null {
    if (!bbox) return null;

    const t = getVideoCoverTransform(videoEl, containerEl);
    if (!t) return null;

    const [x, y, w, h] = bbox;

    return {
        left: ((t.offsetX + x * t.scaleX) / t.cw) * 100,
        top: ((t.offsetY + y * t.scaleY) / t.ch) * 100,
        width: (w * t.scaleX / t.cw) * 100,
        height: (h * t.scaleY / t.ch) * 100,
    };
}

/**
 * Map a video-space point to overlay percentages.
 */
export function mapPointToOverlay(
    point: Point2D | null | undefined,
    videoEl: HTMLVideoElement | null,
    containerEl: HTMLElement | null
): Point2D | null {
    if (!point) return null;

    const t = getVideoCoverTransform(videoEl, containerEl);
    if (!t) return null;

    return {
        x: ((t.offsetX + point.x * t.scaleX) / t.cw) * 100,
        y: ((t.offsetY + point.y * t.scaleY) / t.ch) * 100,
    };
}

export function mapRectToOverlay(
    rect: BoundingBox | null | undefined,
    videoEl: HTMLVideoElement | null,
    containerEl: HTMLElement | null
): OverlayBox | null {
    if (!rect) return null;
    return mapBboxToOverlay([rect.x, rect.y, rect.width, rect.height], videoEl, containerEl);
}

/**
 * Computes the exact sub-rectangle of the video frame (in native video pixel coordinates)
 * that is visible inside `containerEl` under CSS `object-fit: cover`.
 */
export function getVisibleVideoRegion(
    videoEl: HTMLVideoElement | null,
    containerEl: HTMLElement | null
): BoundingBox | null {
    if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) return null;
    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;

    if (!containerEl || !containerEl.clientWidth || !containerEl.clientHeight) {
        return { x: 0, y: 0, width: vw, height: vh };
    }

    const cw = containerEl.clientWidth;
    const ch = containerEl.clientHeight;

    const videoRatio = vw / vh;
    const containerRatio = cw / ch;

    let sx = 0;
    let sy = 0;
    let sw = vw;
    let sh = vh;

    if (videoRatio > containerRatio) {
        // Video is wider than container: left and right are cropped
        sw = cw * (vh / ch);
        sx = (vw - sw) / 2;
    } else {
        // Video is taller than container: top and bottom are cropped
        sh = ch * (vw / cw);
        sy = (vh - sh) / 2;
    }

    return {
        x: Math.max(0, Math.round(sx)),
        y: Math.max(0, Math.round(sy)),
        width: Math.min(vw, Math.round(sw)),
        height: Math.min(vh, Math.round(sh)),
    };
}

/** Fixed center scan region used by currency detection (ratio of video dimensions). */
export const CURRENCY_SCAN_RATIO = 0.85;

export function getCurrencyScanRegion(
    videoEl: HTMLVideoElement | null,
    containerEl?: HTMLElement | null
): BoundingBox | null {
    if (!videoEl?.videoWidth || !videoEl?.videoHeight) return null;
    const base = containerEl ? getVisibleVideoRegion(videoEl, containerEl) : null;
    const region = base || { x: 0, y: 0, width: videoEl.videoWidth, height: videoEl.videoHeight };
    const cropW = region.width * CURRENCY_SCAN_RATIO;
    const cropH = region.height * CURRENCY_SCAN_RATIO;
    return {
        x: Math.round(region.x + (region.width - cropW) / 2),
        y: Math.round(region.y + (region.height - cropH) / 2),
        width: Math.round(cropW),
        height: Math.round(cropH),
    };
}
