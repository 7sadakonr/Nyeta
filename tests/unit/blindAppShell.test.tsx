// @vitest-environment jsdom
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const assistantPrepareForCall = vi.fn();
const callPrepareForExit = vi.fn();
let audioReady = false;
const { announceMock, playEarcon } = vi.hoisted(() => ({ announceMock: vi.fn(), playEarcon: vi.fn() }));
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

vi.mock('@/shared/accessibility/audio', () => ({ playEarcon }));
vi.mock('@/shared/accessibility/announcer', () => ({ announce: (...args: unknown[]) => announceMock(...args) }));

import BlindAppShell from '@/features/blind-app/BlindAppShell';

describe('BlindAppShell', () => {
    beforeEach(() => {
        audioReady = false;
        document.documentElement.style.removeProperty('--app-h');
    });
    afterEach(() => vi.clearAllMocks());

    it('keeps entry silent while delegating navigation from content and tabs once', () => {
        const { getByRole, queryByRole, getByTestId, queryByTestId } = render(<BlindAppShell initialTab="assistant" />);

        expect(getByRole('navigation', { name: 'เมนูหลัก' })).toBeTruthy();
        expect(queryByRole('tab')).toBeNull();
        expect(queryByRole('tablist')).toBeNull();
        expect(getByRole('button', { name: 'AI ผู้ช่วย' }).getAttribute('aria-current')).toBe('page');
        expect(getByRole('button', { name: 'สแกนธนบัตร' }).getAttribute('aria-current')).toBeNull();
        expect(getByTestId('mock-assistant').textContent).toBe('assistant:ready');
        expect(queryByTestId('mock-call')).toBeNull();
        expect(speak).not.toHaveBeenCalledWith('ผู้ช่วยพร้อม', { channel: 'status' });

        fireEvent.focusIn(getByTestId('mock-assistant'));
        expect(notifyUserNavigation).not.toHaveBeenCalled();

        fireEvent.focusIn(getByRole('button', { name: 'สแกนธนบัตร' }));
        expect(notifyUserNavigation).toHaveBeenCalledTimes(1);
        fireEvent.click(getByRole('button', { name: 'สแกนธนบัตร' }));
        expect(getByTestId('mock-assistant').textContent).toBe('currency:ready');
        expect(queryByTestId('mock-call')).toBeNull();
        expect(getByRole('button', { name: 'สแกนธนบัตร' }).getAttribute('aria-current')).toBe('page');
        // VoiceOver reads the tab name itself; TTS must not repeat it.
        expect(speak).not.toHaveBeenCalled();
    });

    it('anchors the shell to the viewport with standard tabbar placement', () => {
        const { container, getByRole } = render(<BlindAppShell initialTab="assistant" />);

        const shell = container.firstElementChild as HTMLElement;
        const tablist = getByRole('navigation', { name: 'เมนูหลัก' });
        const tabContent = tablist.firstElementChild as HTMLElement;

        expect(shell.className).toContain('fixed');
        expect(shell.className).toContain('inset-0');
        expect(shell.className).toContain('bg-[#090909]');
        expect(document.documentElement.style.backgroundColor).toBe('rgb(9, 9, 9)');
        expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#090909');
        expect(document.documentElement.style.getPropertyValue('--app-h')).toBe('');
        expect(tablist.className).toContain('bg-[#090909]/80');
        expect(tabContent.className).toContain('safe-area-inset-bottom');
    });

    it('unmounts assistant before mounting call and locks other tabs while calling', () => {
        const { getByRole, getByTestId, queryByTestId } = render(<BlindAppShell initialTab="assistant" />);

        fireEvent.click(getByRole('button', { name: 'ขอความช่วยเหลือจากอาสา' }));
        expect(assistantPrepareForCall).toHaveBeenCalledTimes(1);
        expect(queryByTestId('mock-assistant')).toBeNull();
        fireEvent.click(getByTestId('mock-call'));

        const currencyTab = getByRole('button', { name: 'สแกนธนบัตร' });
        expect(currencyTab.getAttribute('aria-disabled')).toBe('true');
        fireEvent.click(currencyTab);
        expect(getByTestId('mock-call')).toBeTruthy();
        expect(callPrepareForExit).not.toHaveBeenCalled();
        expect(speak).not.toHaveBeenCalledWith('กรุณาวางสายก่อนเปลี่ยนเมนู', expect.anything());
    });
    it('has one main landmark whose heading names the current mode, and keeps the address in step with the tab', () => {
        const { getByRole } = render(<BlindAppShell initialTab="assistant" />);

        expect(getByRole('main').querySelectorAll('h1')).toHaveLength(1);
        expect(getByRole('heading', { level: 1 }).textContent).toBe('AI ผู้ช่วย');

        fireEvent.click(getByRole('button', { name: 'อ่านเอกสาร' }));
        expect(getByRole('heading', { level: 1 }).textContent).toBe('อ่านเอกสาร');
        expect(new URL(window.location.href).searchParams.get('tab')).toBe('reader');
    });

    it('says why a locked tab does not respond during a call, audibly', () => {
        const { getByRole, getByTestId } = render(<BlindAppShell initialTab="assistant" />);
        fireEvent.click(getByRole('button', { name: 'ขอความช่วยเหลือจากอาสา' }));
        fireEvent.click(getByTestId('mock-call'));

        fireEvent.click(getByRole('button', { name: 'สแกนธนบัตร' }));

        expect(announceMock).toHaveBeenCalledWith('วางสายก่อนเปลี่ยนเมนู');
        expect(playEarcon).toHaveBeenCalledWith('error');
    });
});
