// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { formatOcrText } from '@/features/blind-assistant/client/ocrText';
import { laplacianVariance } from '@/features/blind-assistant/client/geminiVision';
import { buildGuidance, isCapturable, PageAlignmentMetrics } from '@/features/blind-assistant/client/pageEdgeDetection';
import { padBounds } from '@/features/blind-assistant/hooks/useDocumentReader';

vi.mock('@/shared/accessibility/speechController', () => ({ speechController: { speak: vi.fn(), stop: vi.fn() } }));

describe('formatOcrText', () => {
    it('splits on blank lines so each paragraph can be swiped separately', () => {
        expect(formatOcrText('ใบเสร็จ\n\nร้านสะดวกซื้อ\nสาขา 1\n\nรวม 120 บาท')).toEqual([
            'ใบเสร็จ',
            'ร้านสะดวกซื้อ\nสาขา 1',
            'รวม 120 บาท',
        ]);
    });

    it('removes markdown markers that a screen reader would read aloud', () => {
        const result = formatOcrText('## หัวข้อ\n\n**ตัวหนา** และ __ขีด__\n\n* รายการ\n|---|---|\n| ชื่อ | ราคา |');
        expect(result.join('\n')).not.toMatch(/[#*_|]/);
        expect(result[0]).toBe('หัวข้อ');
        expect(result.join('\n')).toContain('ชื่อ ราคา');
    });

    it('keeps paragraph breaks when blank lines contain spaces and returns nothing for empty text', () => {
        expect(formatOcrText('ก\n   \nข')).toEqual(['ก', 'ข']);
        expect(formatOcrText('')).toEqual([]);
        expect(formatOcrText(null)).toEqual([]);
        expect(formatOcrText('  \n\n  ')).toEqual([]);
    });
});

describe('laplacianVariance', () => {
    const image = (w: number, h: number, value: (x: number, y: number) => number) => {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y += 1) {
            for (let x = 0; x < w; x += 1) {
                const i = (y * w + x) * 4;
                data[i] = data[i + 1] = data[i + 2] = value(x, y);
                data[i + 3] = 255;
            }
        }
        return data;
    };

    it('scores a crisp edge pattern higher than a blurred one', () => {
        const sharp = image(32, 32, (x) => (x % 2 ? 255 : 0));
        const blurred = image(32, 32, (x) => 128 + Math.round(20 * Math.sin(x / 4)));
        const flat = image(32, 32, () => 128);

        expect(laplacianVariance(sharp, 32, 32)).toBeGreaterThan(laplacianVariance(blurred, 32, 32));
        expect(laplacianVariance(flat, 32, 32)).toBe(0);
    });
});

describe('page capture readiness', () => {
    const metrics = (overrides: Partial<PageAlignmentMetrics> = {}): PageAlignmentMetrics => ({
        detected: true,
        vw: 1000,
        vh: 1000,
        rotation: 0,
        coverage: 0.5,
        cutoff: [],
        centerOffset: { x: 0, y: 0 },
        perspective: { tilt: null, roll: null },
        topW: 1,
        bottomW: 1,
        leftH: 1,
        rightH: 1,
        ...overrides,
    });

    it('captures a slightly tilted or off-centre page instead of waiting for a perfect frame', () => {
        const tilted = metrics({ rotation: 20, centerOffset: { x: 200, y: 0 } });
        expect(buildGuidance(tilted).aligned).toBe(false);
        expect(isCapturable(tilted)).toBe(true);
    });

    it('does not capture a page that is cut off, too small or filling the frame', () => {
        expect(isCapturable(metrics({ cutoff: ['ซ้าย'] }))).toBe(false);
        expect(isCapturable(metrics({ coverage: 0.1 }))).toBe(false);
        expect(isCapturable(metrics({ coverage: 0.95 }))).toBe(false);
        expect(isCapturable(metrics({ detected: false }))).toBe(false);
    });

    it('only mentions a second axis when the page is actually off in that axis', () => {
        // Off only vertically: previously this said "move camera and down" because x was merely non-zero.
        const guidance = buildGuidance(metrics({ centerOffset: { x: 10, y: -300 } })).guidance;
        expect(guidance).toBe('เลื่อนกล้องลงล่าง');
        expect(buildGuidance(metrics({ centerOffset: { x: -300, y: -300 } })).guidance).toBe('เลื่อนกล้องไปทางขวา และลงล่าง');
    });
});

describe('padBounds', () => {
    it('pads by a ratio of the box and clamps to the frame', () => {
        expect(padBounds({ x: 100, y: 100, width: 200, height: 100 }, 0.1, 1000, 1000)).toEqual({ x: 80, y: 90, width: 240, height: 120 });
        const clamped = padBounds({ x: 5, y: 5, width: 990, height: 990 }, 0.1, 1000, 1000);
        expect(clamped.x).toBe(0);
        expect(clamped.y).toBe(0);
        expect(clamped.x + clamped.width).toBeLessThanOrEqual(1000);
        expect(clamped.y + clamped.height).toBeLessThanOrEqual(1000);
    });
});
