'use client';

import { useCallback, useRef } from 'react';
import speechManager from '@/shared/accessibility/speechManager';

export const INTERACTIVE_ACCESSIBILITY_SELECTOR = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="combobox"]',
  '[role="searchbox"]',
  '[role="textbox"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="option"]',
  '[role="treeitem"]',
].join(',');

const SAME_CONTROL_DEDUP_MS = 250;

type NavigationCallback = () => void;

/**
 * Coordinates app TTS with keyboard, touch, and assistive-technology navigation.
 * Browsers do not expose VoiceOver speech state, so this deliberately reacts only
 * to real interaction/focus events and never attempts VoiceOver detection.
 */
export function useAccessibilitySpeechNavigation(onNavigation?: NavigationCallback) {
  const lastInteractionRef = useRef<{ element: Element; at: number } | null>(null);

  const interruptForInteraction = useCallback((target: EventTarget | null) => {
    if (!(target instanceof Element)) return;
    const element = target.closest(INTERACTIVE_ACCESSIBILITY_SELECTOR);
    if (!element) return;

    const now = Date.now();
    const previous = lastInteractionRef.current;
    if (previous?.element === element && now - previous.at < SAME_CONTROL_DEDUP_MS) return;

    lastInteractionRef.current = { element, at: now };
    speechManager?.interruptForAccessibilityNavigation();
    onNavigation?.();
  }, [onNavigation]);

  return {
    onFocusCapture: (event: React.FocusEvent<HTMLElement>) => interruptForInteraction(event.target),
    onPointerDownCapture: (event: React.PointerEvent<HTMLElement>) => interruptForInteraction(event.target),
    onTouchStartCapture: (event: React.TouchEvent<HTMLElement>) => interruptForInteraction(event.target),
    onClickCapture: (event: React.MouseEvent<HTMLElement>) => interruptForInteraction(event.target),
    onKeyDownCapture: (event: React.KeyboardEvent<HTMLElement>) => interruptForInteraction(event.target),
  };
}
