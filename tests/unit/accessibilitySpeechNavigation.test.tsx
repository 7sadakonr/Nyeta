// @vitest-environment jsdom

import { fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { speak, stop, beginListening, endListening, notifyUserNavigation, getSnapshot } = vi.hoisted(() => ({
    speak: vi.fn(), stop: vi.fn(), beginListening: vi.fn(), endListening: vi.fn(), notifyUserNavigation: vi.fn(), getSnapshot: vi.fn()
}));

vi.mock('@/shared/accessibility/speechController', () => ({
    speechController: { speak, stop, beginListening, endListening, notifyUserNavigation, getSnapshot }
}));

import { useAccessibilitySpeechNavigation } from '@/shared/accessibility/useAccessibilitySpeechNavigation';

function NavigationHarness({ onNavigation }: { onNavigation?: () => void }) {
  const handlers = useAccessibilitySpeechNavigation(onNavigation);
  return <div {...handlers}><button type="button"><svg data-testid="icon" /></button><div data-testid="static">ข้อความภาพ</div><div role="tab" tabIndex={0}>โหมดผู้ช่วย</div></div>;
}

describe('accessibility speech navigation delegation', () => {
  afterEach(() => vi.clearAllMocks());
  it('interrupts for interactive focus and activation, including nested icons', () => {
    const { getByRole, getByTestId } = render(<NavigationHarness />);
    const button = getByRole('button');
    fireEvent.focusIn(button);
    fireEvent.pointerDown(getByTestId('icon'));
    fireEvent.touchStart(button);
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(notifyUserNavigation).toHaveBeenCalledTimes(1);
  });
  it('renews navigation for a different focusable control but ignores static content', () => {
    const onNavigation = vi.fn();
    const { getByRole, getByTestId } = render(<NavigationHarness onNavigation={onNavigation} />);
    fireEvent.focusIn(getByTestId('static'));
    fireEvent.focusIn(getByRole('button'));
    fireEvent.focusIn(getByRole('tab'));
    expect(notifyUserNavigation).toHaveBeenCalledTimes(2);
    expect(onNavigation).toHaveBeenCalledTimes(2);
  });

});

