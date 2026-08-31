// @vitest-environment jsdom

import { fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { interruptForAccessibilityNavigation } = vi.hoisted(() => ({ interruptForAccessibilityNavigation: vi.fn() }));
vi.mock('@/shared/accessibility/speechManager', () => ({ default: { interruptForAccessibilityNavigation } }));

import { useAccessibilitySpeechNavigation } from '@/shared/accessibility/useAccessibilitySpeechNavigation';

function NavigationHarness({ onNavigation, preserveSpeech = false }: { onNavigation?: () => void; preserveSpeech?: boolean }) {
  const handlers = useAccessibilitySpeechNavigation(onNavigation, preserveSpeech ? 'preserve' : 'interrupt-realtime');
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
    expect(interruptForAccessibilityNavigation).toHaveBeenCalledTimes(1);
  });
  it('renews navigation for a different focusable control but ignores static content', () => {
    const onNavigation = vi.fn();
    const { getByRole, getByTestId } = render(<NavigationHarness onNavigation={onNavigation} />);
    fireEvent.focusIn(getByTestId('static'));
    fireEvent.focusIn(getByRole('button'));
    fireEvent.focusIn(getByRole('tab'));
    expect(interruptForAccessibilityNavigation).toHaveBeenCalledTimes(2);
    expect(onNavigation).toHaveBeenCalledTimes(2);
  });

  it('preserves app speech on TTS-first surfaces while still reporting navigation', () => {
    const onNavigation = vi.fn();
    const { getByRole } = render(<NavigationHarness onNavigation={onNavigation} preserveSpeech />);

    fireEvent.focusIn(getByRole('button'));
    fireEvent.click(getByRole('button'));

    expect(interruptForAccessibilityNavigation).not.toHaveBeenCalled();
    expect(onNavigation).toHaveBeenCalledTimes(1);
  });
});

