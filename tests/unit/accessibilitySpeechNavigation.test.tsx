// @vitest-environment jsdom

import { fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { speak, stop, beginListening, endListening, notifyUserNavigation, getSnapshot, unlockAudio } = vi.hoisted(() => ({
    speak: vi.fn(), stop: vi.fn(), beginListening: vi.fn(), endListening: vi.fn(), notifyUserNavigation: vi.fn(), getSnapshot: vi.fn(), unlockAudio: vi.fn()
}));

vi.mock('@/shared/accessibility/speechController', () => ({
    speechController: { speak, stop, beginListening, endListening, notifyUserNavigation, getSnapshot, unlockAudio }
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
  it('ignores the first interactive focus after mount but interrupts subsequent VoiceOver focus changes', () => {
    const onNavigation = vi.fn();
    const { getByRole, getByTestId } = render(<NavigationHarness onNavigation={onNavigation} />);
    fireEvent.focusIn(getByTestId('static'));
    fireEvent.focusIn(getByRole('button'));
    expect(notifyUserNavigation).not.toHaveBeenCalled();
    fireEvent.focusIn(getByRole('tab'));
    expect(notifyUserNavigation).toHaveBeenCalledTimes(1);
    expect(onNavigation).toHaveBeenCalledTimes(1);
  });

});


describe('programmatic focus', () => {
  afterEach(() => vi.clearAllMocks());

  it('does not treat focus the app moves itself as the user navigating', async () => {
    const { focusProgrammatically } = await import('@/shared/accessibility/programmaticFocus');
    const { getByRole } = render(<NavigationHarness />);
    // Consume the "first focus is ignored" allowance so only the programmatic rule is under test.
    fireEvent.focusIn(getByRole('button'));
    notifyUserNavigation.mockClear();

    const tab = getByRole('tab');
    focusProgrammatically(tab);
    fireEvent.focusIn(tab);
    expect(notifyUserNavigation).not.toHaveBeenCalled();
  });
});
