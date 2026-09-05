// @vitest-environment jsdom
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const assistantPrepareForCall = vi.fn();
const callPrepareForExit = vi.fn();
let audioReady = false;
const { speak, stop, notifyUserNavigation, unlockAudio } = vi.hoisted(() => ({
    speak: vi.fn(),
    stop: vi.fn(),
    notifyUserNavigation: vi.fn(),
    unlockAudio: vi.fn(),
}));

vi.mock('@/features/blind-assistant/BlindAssistScreen', async () => {
    const React = await import('react');
    return {
        default: React.forwardRef(function MockBlindAssistScreen(
            { mode, audioReady }: { mode: string; audioReady: boolean },
            ref: React.ForwardedRef<{ prepareForCall: () => void }>,
        ) {
            React.useImperativeHandle(ref, () => ({ prepareForCall: assistantPrepareForCall }));
            return <button type="button" data-testid="mock-assistant">{mode}:{audioReady ? 'ready' : 'waiting'}</button>;
        }),
    };
});

vi.mock('@/features/calling/BlindCallScreen', async () => {
    const React = await import('react');
    return {
        default: React.forwardRef(function MockBlindCallScreen(
            { onStatusChange }: { onStatusChange: (status: string) => void },
            ref: React.ForwardedRef<{ prepareForExit: () => void }>,
        ) {
            React.useImperativeHandle(ref, () => ({ prepareForExit: callPrepareForExit }));
            return <button type="button" data-testid="mock-call" onClick={() => onStatusChange('calling')}>call</button>;
        }),
    };
});

vi.mock('@/shared/accessibility/HapticFeedback', () => ({ default: () => null }));
vi.mock('@/features/blind-app/PwaControls', () => ({ default: () => null }));
vi.mock('@/shared/accessibility/speechController', () => ({
    speechController: { speak, stop, notifyUserNavigation, unlockAudio }
}));
vi.mock('@/shared/hooks/useSpeechStatus', () => ({
    useSpeechStatus: () => ({
        state: 'idle',
        channel: null,
        audioReady,
        isSpeaking: false,
        isListening: false,
        isQuiet: false,
    }),
}));

import BlindAppShell from '@/features/blind-app/BlindAppShell';

describe('BlindAppShell', () => {
    beforeEach(() => {
        audioReady = false;
        document.documentElement.style.removeProperty('--app-h');
    });
    afterEach(() => vi.clearAllMocks());

    it('keeps entry silent while delegating navigation from content and tabs once', () => {
        const { getByRole, getByTestId, queryByTestId } = render(<BlindAppShell initialTab="assistant" />);

        expect(getByRole('tablist', { name: 'เมนูหลักสำหรับผู้พิการทางสายตา' })).toBeTruthy();
        expect(getByRole('tab', { name: 'AI ผู้ช่วย' }).getAttribute('aria-selected')).toBe('true');
        expect(getByRole('tab', { name: 'สแกนธนบัตร' }).getAttribute('aria-controls')).toBe('blind-app-panel');
        expect(getByRole('tab', { name: 'อ่านเอกสาร' }).getAttribute('aria-controls')).toBe('blind-app-panel');
        expect(getByRole('tab', { name: 'ขอความช่วยเหลือจากอาสา' }).getAttribute('aria-controls')).toBe('blind-app-panel');
        expect(getByTestId('mock-assistant').textContent).toBe('assistant:ready');
        expect(queryByTestId('mock-call')).toBeNull();
        expect(speak).not.toHaveBeenCalledWith('ผู้ช่วยพร้อม', { channel: 'status' });

        fireEvent.focusIn(getByTestId('mock-assistant'));
        expect(notifyUserNavigation).not.toHaveBeenCalled();

        fireEvent.focusIn(getByRole('tab', { name: 'สแกนธนบัตร' }));
        expect(notifyUserNavigation).toHaveBeenCalledTimes(1);
        fireEvent.click(getByRole('tab', { name: 'สแกนธนบัตร' }));
        expect(getByTestId('mock-assistant').textContent).toBe('currency:ready');
        expect(queryByTestId('mock-call')).toBeNull();
        expect(speak).toHaveBeenCalledWith('สแกนธนบัตร', { channel: 'status' });
    });

    it('anchors the shell to the viewport without bottom safe-area padding in tab content', () => {
        const { container, getByRole } = render(<BlindAppShell initialTab="assistant" />);

        const shell = container.firstElementChild as HTMLElement;
        const tablist = getByRole('tablist', { name: 'เมนูหลักสำหรับผู้พิการทางสายตา' });
        const tabContent = tablist.firstElementChild as HTMLElement;

        expect(shell.className).toContain('fixed');
        expect(shell.className).toContain('inset-0');
        expect(document.documentElement.style.getPropertyValue('--app-h')).toBe('');
        expect(tablist.className).toContain('bg-black/80');
        expect(tabContent.className).not.toContain('pb-');
        expect(tabContent.className).not.toContain('safe-area-inset-bottom');
    });

    it('unmounts assistant before mounting call and locks other tabs while calling', () => {
        const { getByRole, getByTestId, queryByTestId } = render(<BlindAppShell initialTab="assistant" />);

        fireEvent.click(getByRole('tab', { name: 'ขอความช่วยเหลือจากอาสา' }));
        expect(assistantPrepareForCall).toHaveBeenCalledTimes(1);
        expect(queryByTestId('mock-assistant')).toBeNull();
        fireEvent.click(getByTestId('mock-call'));

        const currencyTab = getByRole('tab', { name: 'สแกนธนบัตร' });
        expect(currencyTab.getAttribute('aria-disabled')).toBe('true');
        fireEvent.click(currencyTab);
        expect(getByTestId('mock-call')).toBeTruthy();
        expect(callPrepareForExit).not.toHaveBeenCalled();
        expect(speak).not.toHaveBeenCalledWith('กรุณาวางสายก่อนเปลี่ยนเมนู', expect.anything());
    });
});
