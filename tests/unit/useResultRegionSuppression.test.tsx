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

    it('keeps guidance suppressed after leaving the result region', () => {
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

        // Blur with relatedTarget outside container (e.g. user swiped to ControlBar)
        fireEvent.blur(child1, { relatedTarget: outside });

        // Guidance must remain suppressed persistently
        expect(speechController.isGuidanceSuppressed).toBe(true);

        vi.advanceTimersByTime(500);
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
