// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { getVisibleVideoRegion, getCurrencyScanRegion } from '@/features/blind-assistant/client/videoCoords';
import { captureFrameFromVideo } from '@/features/blind-assistant/client/geminiVision';

describe('Visible Video Region (WYSIWYG Camera Viewfinder)', () => {
    const createMockVideo = (width: number, height: number) => ({
        videoWidth: width,
        videoHeight: height,
    } as HTMLVideoElement);

    const createMockContainer = (width: number, height: number) => ({
        clientWidth: width,
        clientHeight: height,
        getBoundingClientRect: () => ({
            width,
            height,
            top: 0,
            left: 0,
            right: width,
            bottom: height,
            x: 0,
            y: 0,
            toJSON: () => {},
        }),
    } as unknown as HTMLElement);

    describe('getVisibleVideoRegion', () => {
        it('returns full video dimensions when container is omitted or invalid', () => {
            const video = createMockVideo(1280, 720);
            expect(getVisibleVideoRegion(video, null)).toEqual({
                x: 0,
                y: 0,
                width: 1280,
                height: 720,
            });

            const zeroContainer = createMockContainer(0, 0);
            expect(getVisibleVideoRegion(video, zeroContainer)).toEqual({
                x: 0,
                y: 0,
                width: 1280,
                height: 720,
            });

            expect(getVisibleVideoRegion(null, null)).toBeNull();
        });

        it('correctly calculates pillarbox/cropped width when video is wider than container (object-fit: cover)', () => {
            // Video: 1920x1080 (16:9 = 1.777...)
            // Container: 400x800 (1:2 = 0.5)
            // Container is taller than video -> sides of video are cropped off
            const video = createMockVideo(1920, 1080);
            const container = createMockContainer(400, 800);

            const region = getVisibleVideoRegion(video, container);
            expect(region).not.toBeNull();

            // sw = 400 * (1080 / 800) = 540
            // sx = (1920 - 540) / 2 = 690
            expect(region!.width).toBe(540);
            expect(region!.height).toBe(1080);
            expect(region!.x).toBe(690);
            expect(region!.y).toBe(0);
        });

        it('correctly calculates cropped height when video is taller than container (object-fit: cover)', () => {
            // Video: 1080x1920 (9:16 = 0.5625)
            // Container: 600x400 (3:2 = 1.5)
            // Container is wider than video -> top and bottom of video are cropped off
            const video = createMockVideo(1080, 1920);
            const container = createMockContainer(600, 400);

            const region = getVisibleVideoRegion(video, container);
            expect(region).not.toBeNull();

            // sh = 400 * (1080 / 600) = 720
            // sy = (1920 - 720) / 2 = 600
            expect(region!.width).toBe(1080);
            expect(region!.height).toBe(720);
            expect(region!.x).toBe(0);
            expect(region!.y).toBe(600);
        });
    });

    describe('getCurrencyScanRegion', () => {
        it('centers the scan region inside the visible container region', () => {
            const video = createMockVideo(1920, 1080);
            const container = createMockContainer(400, 800);

            const visible = getVisibleVideoRegion(video, container);
            const scanRegion = getCurrencyScanRegion(video, container);

            expect(visible).not.toBeNull();
            expect(scanRegion).not.toBeNull();

            // Scan region must be strictly within the visible region bounds
            expect(scanRegion!.x).toBeGreaterThanOrEqual(visible!.x);
            expect(scanRegion!.y).toBeGreaterThanOrEqual(visible!.y);
            expect(scanRegion!.x + scanRegion!.width).toBeLessThanOrEqual(visible!.x + visible!.width);
            expect(scanRegion!.y + scanRegion!.height).toBeLessThanOrEqual(visible!.y + visible!.height);

            // Scan region center must align with visible center
            const visibleCenterX = visible!.x + visible!.width / 2;
            const visibleCenterY = visible!.y + visible!.height / 2;
            const scanCenterX = scanRegion!.x + scanRegion!.width / 2;
            const scanCenterY = scanRegion!.y + scanRegion!.height / 2;

            expect(Math.abs(scanCenterX - visibleCenterX)).toBeLessThanOrEqual(1);
            expect(Math.abs(scanCenterY - visibleCenterY)).toBeLessThanOrEqual(1);
        });
    });

    describe('captureFrameFromVideo with container', () => {
        it('draws only the visible region of the video onto the canvas', () => {
            const video = createMockVideo(1920, 1080);
            const container = createMockContainer(400, 800);

            let drawnSourceCoords: number[] = [];
            const mockContext = {
                drawImage: vi.fn((_el: unknown, sx: number, sy: number, sw: number, sh: number) => {
                    drawnSourceCoords = [sx, sy, sw, sh];
                }),
            };

            const origCreateElement = document.createElement.bind(document);
            vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
                if (tagName === 'canvas') {
                    return {
                        width: 0,
                        height: 0,
                        getContext: () => mockContext,
                        toDataURL: () => 'data:image/jpeg;base64,mock',
                    } as unknown as HTMLCanvasElement;
                }
                return origCreateElement(tagName);
            }) as unknown as typeof document.createElement);

            captureFrameFromVideo(video, { container });

            // Expected visible coordinates: sx: 690, sy: 0, sw: 540, sh: 1080
            expect(drawnSourceCoords).toEqual([690, 0, 540, 1080]);

            vi.restoreAllMocks();
        });
    });
});
