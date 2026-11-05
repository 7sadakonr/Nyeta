// @vitest-environment jsdom

import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveAnnouncer, announce } from '@/shared/accessibility/announcer';

describe('LiveAnnouncer', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(100); });

    it('mounts both regions up front, empty, so the screen reader has registered them before the first message', () => {
        const { getByRole } = render(<LiveAnnouncer />);

        expect(getByRole('status').textContent).toBe('');
        expect(getByRole('status').getAttribute('aria-live')).toBe('polite');
        expect(getByRole('alert').textContent).toBe('');
        expect(getByRole('alert').getAttribute('aria-live')).toBe('assertive');
    });

    it('routes polite and assertive messages to their own region', async () => {
        const { getByRole } = render(<LiveAnnouncer />);

        act(() => announce('ข้อความปกติ'));
        act(() => announce('เหตุด่วน', { assertive: true }));
        await flush();

        expect(getByRole('status').textContent).toBe('ข้อความปกติ');
        expect(getByRole('alert').textContent).toBe('เหตุด่วน');
    });

    it('announces an identical message again by clearing the region first', async () => {
        const { getByRole } = render(<LiveAnnouncer />);

        act(() => announce('ไม่พบธนบัตร'));
        await flush();
        expect(getByRole('status').textContent).toBe('ไม่พบธนบัตร');

        act(() => announce('ไม่พบธนบัตร'));
        // Cleared immediately, which is what makes assistive technology treat the refill as a new message.
        expect(getByRole('status').textContent).toBe('');
        await flush();
        expect(getByRole('status').textContent).toBe('ไม่พบธนบัตร');
    });

    it('ignores empty text and stops listening after unmount', async () => {
        const { getByRole, unmount } = render(<LiveAnnouncer />);

        act(() => announce(''));
        await flush();
        expect(getByRole('status').textContent).toBe('');

        unmount();
        expect(() => announce('หลังปิด')).not.toThrow();
    });
});
