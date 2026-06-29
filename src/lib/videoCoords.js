function getVideoCoverTransform(videoEl, containerEl) {
    if (!videoEl || !containerEl) return null;

    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;
    if (!vw || !vh) return null;

    const cw = containerEl.clientWidth;
    const ch = containerEl.clientHeight;
    if (!cw || !ch) return null;

    const videoRatio = vw / vh;
    const containerRatio = cw / ch;

    let renderedW;
    let renderedH;
    let offsetX;
    let offsetY;

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
export function mapBboxToOverlay(bbox, videoEl, containerEl) {
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
export function mapPointToOverlay(point, videoEl, containerEl) {
    if (!point) return null;

    const t = getVideoCoverTransform(videoEl, containerEl);
    if (!t) return null;

    return {
        x: ((t.offsetX + point.x * t.scaleX) / t.cw) * 100,
        y: ((t.offsetY + point.y * t.scaleY) / t.ch) * 100,
    };
}

export function mapRectToOverlay(rect, videoEl, containerEl) {
    if (!rect) return null;
    return mapBboxToOverlay([rect.x, rect.y, rect.width, rect.height], videoEl, containerEl);
}

/** Fixed center scan region used by currency detection (ratio of video dimensions). */
export const CURRENCY_SCAN_RATIO = 0.45;

export function getCurrencyScanRegion(videoEl) {
    if (!videoEl?.videoWidth) return null;
    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;
    const cropW = vw * CURRENCY_SCAN_RATIO;
    const cropH = vh * CURRENCY_SCAN_RATIO;
    return {
        x: (vw - cropW) / 2,
        y: (vh - cropH) / 2,
        width: cropW,
        height: cropH,
    };
}
