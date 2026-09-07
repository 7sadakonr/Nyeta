// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CaptureControls from '@/features/calling/components/CaptureControls';
import ImageViewer from '@/features/calling/components/ImageViewer';

describe('CaptureControls Unified Dock', () => {
    it('renders pause/capture, flash toggle, and end call buttons seamlessly in one dock', () => {
        const handleCapture = vi.fn();
        const handleToggleFlash = vi.fn();
        const handleEndCall = vi.fn();

        render(
            <CaptureControls
                onCapture={handleCapture}
                onToggleFlash={handleToggleFlash}
                onEndCall={handleEndCall}
                captureState="idle"
            />
        );

        // 1. Capture / Freeze button
        const captureBtn = screen.getByRole('button', { name: /หยุดภาพดู หรือถ่ายภาพความละเอียดสูง/i });
        expect(captureBtn).toBeDefined();
        expect(captureBtn.textContent).toContain('หยุดภาพดู');
        fireEvent.click(captureBtn);
        expect(handleCapture).toHaveBeenCalledWith({ flash: false });

        // 2. Flash toggle button
        const flashBtn = screen.getByRole('button', { name: /เปิดแฟลช/i });
        expect(flashBtn).toBeDefined();
        fireEvent.click(flashBtn);
        expect(handleToggleFlash).toHaveBeenCalledWith(true);

        // 3. End call button
        const endCallBtn = screen.getByRole('button', { name: /วางสาย/i });
        expect(endCallBtn).toBeDefined();
        fireEvent.click(endCallBtn);
        expect(handleEndCall).toHaveBeenCalledTimes(1);
    });

    it('displays loading state during capture and sending', () => {
        const { rerender } = render(
            <CaptureControls
                onCapture={vi.fn()}
                captureState="capturing"
            />
        );

        expect(screen.getByText('กำลังถ่าย...')).toBeDefined();

        rerender(
            <CaptureControls
                onCapture={vi.fn()}
                captureState="sending"
            />
        );

        expect(screen.getByText('กำลังส่ง...')).toBeDefined();
    });
});

describe('ImageViewer Inspection Modal', () => {
    const mockImageBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...';

    it('renders image, header return pill, and zoom/fit dock', () => {
        const handleClose = vi.fn();

        render(
            <ImageViewer
                imageBase64={mockImageBase64}
                onClose={handleClose}
            />
        );

        // Image present
        const img = screen.getByAltText('ภาพถ่ายจากกล้องสดของผู้ขอความช่วยเหลือ');
        expect(img).toBeDefined();

        // Header return button
        const returnBtn = screen.getByRole('button', { name: 'กลับไปที่กล้องสด' });
        expect(returnBtn).toBeDefined();
        fireEvent.click(returnBtn);
        expect(handleClose).toHaveBeenCalledTimes(1);

        // Initial zoom percentage is 100%
        expect(screen.getByText('100%')).toBeDefined();

        // Zoom In increases percentage
        const zoomInBtn = screen.getByRole('button', { name: 'ซูมเข้า' });
        fireEvent.click(zoomInBtn);
        expect(screen.getByText('150%')).toBeDefined();

        // Fit button resets zoom
        const fitBtn = screen.getByRole('button', { name: 'ปรับภาพให้พอดีจอ' });
        fireEvent.click(fitBtn);
        expect(screen.getByText('100%')).toBeDefined();

        // Bottom dock close button
        const closeBtn = screen.getByRole('button', { name: 'ปิดดูภาพ' });
        fireEvent.click(closeBtn);
        expect(handleClose).toHaveBeenCalledTimes(2);
    });

    it('returns null when imageBase64 is empty', () => {
        const { container } = render(
            <ImageViewer imageBase64={null} onClose={vi.fn()} />
        );
        expect(container.firstChild).toBeNull();
    });
});
