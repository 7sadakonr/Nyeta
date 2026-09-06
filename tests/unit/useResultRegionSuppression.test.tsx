// @vitest-environment jsdom

import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useResultRegionSuppression } from '@/shared/accessibility/useResultRegionSuppression';
import { speechController } from '@/shared/accessibility/speechController';

function TestResultRegion({ onResetReady }: { onResetReady?: (reset: () => void) => void }) {
    const { resultRegionProps, resetSuppression } = useResultRegionSuppression();

    if (onResetReady) {
        onResetReady(resetSuppression);
    }

    return (
        <div data-testid="container" {...resultRegionProps} tabIndex={-1}>
            <button data-testid="child-1">Paragraph 1</button>
            <button data-testid="child-2">Paragraph 2</button>
        </div>
    );
}

describe('useResultRegionSuppression', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        speechController.setGuidanceSuppressed(false);
    });

    afterEach(() => {
        vi.useRealTimers();
        speechController.setGuidanceSuppressed(false);
    });

    it('suppresses guidance when focus enters the result region', () => {
        const { getByTestId } = render(<TestResultRegion />);

        expect(speechController.isGuidanceSuppressed).toBe(false);

        fireEvent.focus(getByTestId('child-1'));
        expect(speechController.isGuidanceSuppressed).toBe(true);
    });

    it('does not unsuppress when moving focus between elements inside the same result region', () => {
        const { getByTestId } = render(<TestResultRegion />);
        const child1 = getByTestId('child-1');
        const child2 = getByTestId('child-2');

        fireEvent.focus(child1);
        expect(speechController.isGuidanceSuppressed).toBe(true);

        // Blur from child1 with relatedTarget pointing to child2
        fireEvent.blur(child1, { relatedTarget: child2 });
        expect(speechController.isGuidanceSuppressed).toBe(true);

        vi.advanceTimersByTime(200);
        expect(speechController.isGuidanceSuppressed).toBe(true);
    });

    it('unsuppresses guidance after leaving the result region with debounce', () => {
        const { getByTestId } = render(
            <div>
                <TestResultRegion />
                <button data-testid="outside-button">Outside</button>
            </div>
        );

        const child1 = getByTestId('child-1');
        const outside = getByTestId('outside-button');

        fireEvent.focus(child1);
        expect(speechController.isGuidanceSuppressed).toBe(true);

        // Blur with relatedTarget outside container
        fireEvent.blur(child1, { relatedTarget: outside });

        // Immediately still suppressed because of 150ms debounce
        expect(speechController.isGuidanceSuppressed).toBe(true);

        // Advance 100ms: still debouncing
        vi.advanceTimersByTime(100);
        expect(speechController.isGuidanceSuppressed).toBe(true);

        // Advance past 150ms: unsuppressed
        vi.advanceTimersByTime(60);
        expect(speechController.isGuidanceSuppressed).toBe(false);
    });

    it('cancels exit debounce if focus re-enters within the debounce window', () => {
        const { getByTestId } = render(<TestResultRegion />);
        const child1 = getByTestId('child-1');
        const child2 = getByTestId('child-2');

        fireEvent.focus(child1);
        expect(speechController.isGuidanceSuppressed).toBe(true);

        // Simulate touch gesture where relatedTarget is null
        fireEvent.blur(child1, { relatedTarget: null });
        expect(speechController.isGuidanceSuppressed).toBe(true);

        // Advance 100ms (before 150ms debounce fires)
        vi.advanceTimersByTime(100);

        // Focus next paragraph inside container
        fireEvent.focus(child2);

        // Advance past the original 150ms
        vi.advanceTimersByTime(100);

        // Remains suppressed because focus re-entered
        expect(speechController.isGuidanceSuppressed).toBe(true);
    });

    it('unsuppresses immediately when resetSuppression is called', () => {
        let resetFn: () => void = () => {};
        const { getByTestId } = render(
            <TestResultRegion onResetReady={(reset) => { resetFn = reset; }} />
        );

        fireEvent.focus(getByTestId('child-1'));
        expect(speechController.isGuidanceSuppressed).toBe(true);

        resetFn();
        expect(speechController.isGuidanceSuppressed).toBe(false);
    });

    it('cleans up and unsuppresses on unmount', () => {
        const { getByTestId, unmount } = render(<TestResultRegion />);

        fireEvent.focus(getByTestId('child-1'));
        expect(speechController.isGuidanceSuppressed).toBe(true);

        unmount();
        expect(speechController.isGuidanceSuppressed).toBe(false);
    });
});
