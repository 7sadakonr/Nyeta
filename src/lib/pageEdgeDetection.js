/**

 * Document/page edge detection via Scanic (Rust/WASM contour scanner).

 */



const MARGIN_RATIO = 0.03;

const MAX_COVERAGE = 0.96;

const MAX_SIDE_ASYMMETRY = 0.6;



let _scanner = null;

let _frameCanvas = null;

let _frameCtx = null;



function notDetectedResult() {

    return {

        detected: false,

        bounds: null,

        corners: null,

        aligned: false,

        guidance: '',

        metrics: null,

    };

}



export async function preloadPageScanner() {

    if (_scanner) return;

    const { Scanner } = await import('scanic');

    _scanner = new Scanner();

    await _scanner.initialize();

}



function dist(a, b) {

    return Math.hypot(b.x - a.x, b.y - a.y);

}



function angleDeg(a, b) {

    return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

}



function quadArea(corners) {

    const { tl, tr, br, bl } = corners;

    return Math.abs(

        (tl.x * tr.y - tr.x * tl.y) +

        (tr.x * br.y - br.x * tr.y) +

        (br.x * bl.y - bl.x * br.y) +

        (bl.x * tl.y - tl.x * bl.y)

    ) / 2;

}



function centroid(corners) {

    const { tl, tr, br, bl } = corners;

    return {

        x: (tl.x + tr.x + br.x + bl.x) / 4,

        y: (tl.y + tr.y + br.y + bl.y) / 4,

    };

}



function isValidQuadShape(corners) {

    const { tl, tr, br, bl } = corners;

    const topW = dist(tl, tr);

    const bottomW = dist(bl, br);

    const leftH = dist(tl, bl);

    const rightH = dist(tr, br);



    if (topW < 1 || bottomW < 1 || leftH < 1 || rightH < 1) return false;



    const widthRatio = Math.abs(topW - bottomW) / Math.max(topW, bottomW);

    const heightRatio = Math.abs(leftH - rightH) / Math.max(leftH, rightH);

    if (widthRatio > MAX_SIDE_ASYMMETRY || heightRatio > MAX_SIDE_ASYMMETRY) return false;



    return quadArea(corners) >= 1;

}



function buildGuidance(metrics) {

    if (!metrics.detected) {

        return { aligned: false, guidance: '' };

    }



    const { cutoff, coverage, centerOffset, rotation, perspective } = metrics;



    if (cutoff.length > 0) {

        const sides = cutoff.join(' ');

        return {

            aligned: false,

            guidance: `เอกสารถูกตัดขอบ${sides} ถอยกล้องออก`,

        };

    }



    if (coverage < 0.15) {

        return { aligned: false, guidance: 'ขยับเข้าใกล้เอกสารอีกหน่อย' };

    }



    if (coverage > 0.90) {

        return { aligned: false, guidance: 'ถอยกล้องออกนิดนึง' };

    }



    const cxTol = metrics.vw * 0.12;

    const cyTol = metrics.vh * 0.12;



    if (Math.abs(centerOffset.x) > cxTol || Math.abs(centerOffset.y) > cyTol) {

        let dir = 'เลื่อนกล้อง';

        if (centerOffset.x < -cxTol) dir += 'ไปทางขวา';

        else if (centerOffset.x > cxTol) dir += 'ไปทางซ้าย';

        if (centerOffset.y < -cyTol) dir += centerOffset.x !== 0 ? ' และลงล่าง' : 'ลงล่าง';

        else if (centerOffset.y > cyTol) dir += centerOffset.x !== 0 ? ' และขึ้นบน' : 'ขึ้นบน';

        return { aligned: false, guidance: dir };

    }



    if (Math.abs(rotation) > 12) {

        const rotDir = rotation > 0 ? 'ขวา' : 'ซ้าย';

        return { aligned: false, guidance: `เอกสารเอียง หมุนกล้องไปทาง${rotDir}` };

    }



    if (perspective.tilt) {

        return { aligned: false, guidance: perspective.tilt };

    }



    if (perspective.roll) {

        return { aligned: false, guidance: perspective.roll };

    }



    return { aligned: true, guidance: 'ตรงแล้ว กำลังถ่าย' };

}



function computeAlignmentFromCorners(corners, vw, vh) {

    const topW = dist(corners.tl, corners.tr);

    const bottomW = dist(corners.bl, corners.br);

    const leftH = dist(corners.tl, corners.bl);

    const rightH = dist(corners.tr, corners.br);

    const rotation = angleDeg(corners.tl, corners.tr);



    const center = centroid(corners);

    const frameCx = vw / 2;

    const frameCy = vh / 2;



    const marginX = vw * MARGIN_RATIO;

    const marginY = vh * MARGIN_RATIO;

    const cutoff = [];

    if (corners.tl.x < marginX || corners.tr.x < marginX) cutoff.push('ซ้าย');

    if (corners.tr.x > vw - marginX || corners.br.x > vw - marginX) cutoff.push('ขวา');

    if (corners.tl.y < marginY || corners.bl.y < marginY) cutoff.push('บน');

    if (corners.bl.y > vh - marginY || corners.br.y > vh - marginY) cutoff.push('ล่าง');



    const coverage = quadArea(corners) / (vw * vh);



    if (!isValidQuadShape(corners) || coverage > MAX_COVERAGE) {

        return notDetectedResult();

    }



    const widthRatio = Math.abs(topW - bottomW) / Math.max(topW, bottomW);

    const heightRatio = Math.abs(leftH - rightH) / Math.max(leftH, rightH);



    const perspective = { tilt: null, roll: null };

    if (widthRatio > 0.25) {

        if (topW < bottomW) perspective.tilt = 'เงยกล้องขึ้นให้ขนานกับกระดาษ';

        else perspective.tilt = 'ก้มกล้องลงให้ขนานกับกระดาษ';

    } else if (heightRatio > 0.25) {

        if (leftH < rightH) perspective.roll = 'เอียงกล้องไปทางซ้ายให้ขนานกับกระดาษ';

        else perspective.roll = 'เอียงกล้องไปทางขวาให้ขนานกับกระดาษ';

    }



    const metrics = {

        detected: true,

        vw,

        vh,

        rotation,

        coverage,

        cutoff: [...new Set(cutoff)],

        centerOffset: { x: center.x - frameCx, y: center.y - frameCy },

        perspective,

        topW,

        bottomW,

        leftH,

        rightH,

    };



    const { aligned, guidance } = buildGuidance(metrics);



    const xs = [corners.tl.x, corners.tr.x, corners.br.x, corners.bl.x];

    const ys = [corners.tl.y, corners.tr.y, corners.br.y, corners.bl.y];

    const pad = 2;

    const bounds = {

        x: Math.max(0, Math.min(...xs) - pad),

        y: Math.max(0, Math.min(...ys) - pad),

        width: Math.min(vw, Math.max(...xs) - Math.min(...xs) + pad * 2),

        height: Math.min(vh, Math.max(...ys) - Math.min(...ys) + pad * 2),

    };



    return {

        detected: true,

        bounds,

        corners,

        aligned,

        guidance,

        metrics,

    };

}



function mapScanicCorners(scanCorners) {

    if (!scanCorners?.topLeft || !scanCorners?.topRight || !scanCorners?.bottomRight || !scanCorners?.bottomLeft) {

        return null;

    }



    return {

        tl: { x: scanCorners.topLeft.x, y: scanCorners.topLeft.y },

        tr: { x: scanCorners.topRight.x, y: scanCorners.topRight.y },

        br: { x: scanCorners.bottomRight.x, y: scanCorners.bottomRight.y },

        bl: { x: scanCorners.bottomLeft.x, y: scanCorners.bottomLeft.y },

    };

}



function drawVideoFrame(video, vw, vh) {
    if (!_frameCanvas) {
        _frameCanvas = document.createElement('canvas');
        _frameCanvas.width = vw;
        _frameCanvas.height = vh;
        _frameCtx = _frameCanvas.getContext('2d', { willReadFrequently: true });
    } else if (_frameCanvas.width !== vw || _frameCanvas.height !== vh) {
        _frameCanvas.width = vw;
        _frameCanvas.height = vh;
    }

    _frameCtx.drawImage(video, 0, 0, vw, vh);
    return _frameCanvas;
}



/**

 * Returns axis-aligned bounding box of detected document region.

 */

export async function detectPageBounds(video) {

    const analysis = await analyzePageAlignment(video);

    return analysis?.bounds ?? null;

}



/**

 * Full page alignment analysis with 4 corners and Thai guidance.

 */

export async function analyzePageAlignment(video) {

    if (!video || video.readyState < 2) {

        return notDetectedResult();

    }



    if (!_scanner) {

        try {

            await preloadPageScanner();

        } catch {

            return notDetectedResult();

        }

    }



    const vw = video.videoWidth || 640;

    const vh = video.videoHeight || 480;

    const frameCanvas = drawVideoFrame(video, vw, vh);



    let scan;

    try {

        scan = await _scanner.scan(frameCanvas, { mode: 'detect' });

    } catch {

        return notDetectedResult();

    }



    if (!scan?.success || !scan.corners) {

        return notDetectedResult();

    }



    const corners = mapScanicCorners(scan.corners);

    if (!corners) {

        return notDetectedResult();

    }



    return computeAlignmentFromCorners(corners, vw, vh);

}


