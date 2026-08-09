import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Blind Assistant camera accessibility', () => {
    it('keeps visual camera overlays hidden while exposing a polite status outside that subtree', () => {
        const cameraView = readSource('src/features/blind-assistant/components/CameraView.tsx');
        const screen = readSource('src/features/blind-assistant/BlindAssistScreen.tsx');

        expect(cameraView).toContain('aria-hidden="true"');
        expect(cameraView).not.toMatch(/aria-live=/);
        expect(cameraView).not.toMatch(/role="status"/);
        expect(screen).toContain('role="status" aria-live="polite" aria-atomic="true"');
    });
});