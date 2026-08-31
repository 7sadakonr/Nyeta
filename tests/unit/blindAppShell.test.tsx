// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const assistantPrepareForCall = vi.fn();
const callPrepareForExit = vi.fn();
const { activateFromUserGesture, clearPausedSpeech, cancel, speak, interruptForAccessibilityNavigation } = vi.hoisted(() => ({
    activateFromUserGesture: vi.fn(),
    clearPausedSpeech: vi.fn(),
    cancel: vi.fn(),
    speak: vi.fn(),
    interruptForAccessibilityNavigation: vi.fn(),
}));

vi.mock('@/features/blind-assistant/BlindAssistScreen', async () => {
    const React = await import('react');
    return {
        default: React.forwardRef(function MockBlindAssistScreen(
            { mode }: { mode: string },
            ref: React.ForwardedRef<{ prepareForCall: () => void }>,
        ) {
            React.useImperativeHandle(ref, () => ({ prepareForCall: assistantPrepareForCall }));
            return <div data-testid="mock-assistant">{mode}</div>;
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
vi.mock('@/shared/accessibility/speechManager', () => ({
    default: { activateFromUserGesture, clearPausedSpeech, cancel, speak, interruptForAccessibilityNavigation },
    Priority: { AMBIENT: 0, GUIDANCE: 1, ACTION: 2, RESULT: 3, CRITICAL: 4, HIGH: 3 },
}));

import BlindAppShell from '@/features/blind-app/BlindAppShell';

describe('BlindAppShell', () => {
    afterEach(() => vi.clearAllMocks());

    it('activates browser speech from the first assistant gesture', () => {
        const { getByTestId } = render(<BlindAppShell initialTab="assistant" />);

        fireEvent.touchStart(getByTestId('mock-assistant'));

        expect(activateFromUserGesture).toHaveBeenCalledWith('ผู้ช่วยพร้อม', expect.objectContaining({ owner: 'blind-entry' }));
    });

    it('renders four accessible tabs and only the selected assistant mode', () => {
        const { getByRole, getByTestId, queryByTestId } = render(<BlindAppShell initialTab="assistant" />);

        expect(getByRole('tablist', { name: 'เมนูหลักสำหรับผู้พิการทางสายตา' })).toBeTruthy();
        expect(getByRole('tab', { name: 'AI' }).getAttribute('aria-selected')).toBe('true');
        expect(getByRole('tab', { name: 'เงิน' }).getAttribute('aria-controls')).toBe('blind-app-panel');
        expect(getByRole('tab', { name: 'อ่าน' }).getAttribute('aria-controls')).toBe('blind-app-panel');
        expect(getByRole('tab', { name: 'อาสา' }).getAttribute('aria-controls')).toBe('blind-app-panel');
        expect(getByTestId('mock-assistant').textContent).toBe('assistant');
        expect(queryByTestId('mock-call')).toBeNull();

        fireEvent.click(getByRole('tab', { name: 'เงิน' }));
        expect(getByTestId('mock-assistant').textContent).toBe('currency');
        expect(queryByTestId('mock-call')).toBeNull();
        expect(interruptForAccessibilityNavigation).not.toHaveBeenCalled();
    });

    it('unmounts assistant before mounting call and locks other tabs while calling', () => {
        const { getByRole, getByTestId, queryByTestId } = render(<BlindAppShell initialTab="assistant" />);

        fireEvent.click(getByRole('tab', { name: 'อาสา' }));
        expect(assistantPrepareForCall).toHaveBeenCalledTimes(1);
        expect(queryByTestId('mock-assistant')).toBeNull();
        fireEvent.click(getByTestId('mock-call'));

        const currencyTab = getByRole('tab', { name: 'เงิน' });
        expect(currencyTab.getAttribute('aria-disabled')).toBe('true');
        fireEvent.click(currencyTab);
        expect(getByTestId('mock-call')).toBeTruthy();
        expect(callPrepareForExit).not.toHaveBeenCalled();
    });
});
