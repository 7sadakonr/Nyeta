// @vitest-environment jsdom

import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/blind-app/WelcomeScreen', () => ({ default: () => <div data-testid="welcome" /> }));
vi.mock('@/features/blind-app/BlindAppShell', () => ({ default: () => <div data-testid="app" /> }));
vi.mock('@/shared/ui/PortraitGuardian', () => ({ default: () => null }));

import ClientEntryPoint from '@/features/blind-app/ClientEntryPoint';

describe('ClientEntryPoint', () => {
    beforeEach(() => {
        window.localStorage.clear();
        Object.defineProperty(window.navigator, 'webdriver', { configurable: true, value: false });
    });

    it('shows the welcome screen on the first visit', async () => {
        const { findByTestId, queryByTestId } = render(<ClientEntryPoint initialTab="assistant" />);
        expect(await findByTestId('welcome')).toBeTruthy();
        expect(queryByTestId('app')).toBeNull();
    });

    it('goes straight to the app once onboarding is complete', async () => {
        window.localStorage.setItem('nyeta_onboarded', '1');
        const { findByTestId, queryByTestId } = render(<ClientEntryPoint initialTab="assistant" />);
        expect(await findByTestId('app')).toBeTruthy();
        await waitFor(() => expect(queryByTestId('welcome')).toBeNull());
    });

    it('does not flash the welcome screen before storage has been read', () => {
        window.localStorage.setItem('nyeta_onboarded', '1');
        const { container } = render(<ClientEntryPoint initialTab="assistant" />);
        // The synchronous first render is a blank placeholder, never the welcome screen.
        expect(container.querySelector('[data-testid="welcome"]')).toBeNull();
    });
});
