// @vitest-environment jsdom
import React, { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getCameraHeightClass } from '@/features/blind-assistant/BlindAssistScreen';
import CameraView from '@/features/blind-assistant/components/CameraView';

vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
});

describe('AI camera layout', () => {
    it('keeps the camera large before a description and collapses it after one arrives', () => {
        expect(getCameraHeightClass(false)).toContain('52dvh');
        expect(getCameraHeightClass(true)).toContain('20dvh');
    });

    it('uses an edge-to-edge square camera frame in assistant mode', () => {
        const videoRef = createRef<HTMLVideoElement>();
        const cameraContainerRef = createRef<HTMLDivElement>();
        const { container } = render(
            <CameraView
                videoRef={videoRef}
                cameraContainerRef={cameraContainerRef}
                cameraHeightClass="h-80"
                mode="assistant"
                aiReady
                currencyResult={null}
            />,
        );

        expect(container.firstElementChild?.className).toContain('w-full');
        expect(container.firstElementChild?.className).toContain('rounded-none');
    });

    it('uses the same square camera frame for currency mode', () => {
        const videoRef = createRef<HTMLVideoElement>();
        const cameraContainerRef = createRef<HTMLDivElement>();
        const { container } = render(
            <CameraView
                videoRef={videoRef}
                cameraContainerRef={cameraContainerRef}
                cameraHeightClass="h-80"
                mode="currency"
                aiReady
                currencyResult={null}
            />,
        );

        expect(container.firstElementChild?.className).toContain('rounded-none');
    });

    it('shows the latest amount and detected denominations in bottom camera cards', () => {
        const videoRef = createRef<HTMLVideoElement>();
        const cameraContainerRef = createRef<HTMLDivElement>();
        render(
            <CameraView
                videoRef={videoRef}
                cameraContainerRef={cameraContainerRef}
                cameraHeightClass="h-80"
                mode="currency"
                aiReady
                currencyResult={{
                    captureId: 1,
                    source: 'gemini',
                    total: 100,
                    signature: 'note-100-1',
                    items: [{ type: 'note', value: 100, quantity: 1, locations: ['center'] }],
                }}
            />,
        );

        const summary = screen.getByLabelText('สรุปการตรวจเงิน');
        expect(summary.className).toContain('absolute');
        expect(summary.className).toContain('bottom-3');
        expect(screen.getByText('ตรวจพบล่าสุด')).toBeTruthy();
        expect(screen.getByText('ที่ตรวจจับได้')).toBeTruthy();
        expect(screen.getByText('฿100')).toBeTruthy();
        expect(screen.getByText('ธนบัตร 100 × 1')).toBeTruthy();
        expect(screen.queryByText('ยอดรวม')).toBeNull();
    });
});
