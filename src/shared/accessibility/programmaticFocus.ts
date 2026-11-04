// Focus the app moves itself (e.g. onto a new result) is not the user navigating, so it must not start the quiet window.
const PROGRAMMATIC_FOCUS_WINDOW_MS = 400;
let programmaticFocusUntil = 0;

/** Focus an element from code without it being treated as user navigation (which would mute TTS for 3.5s). */
export function focusProgrammatically(element: HTMLElement | null | undefined, options?: FocusOptions): void {
    if (!element) return;
    programmaticFocusUntil = Date.now() + PROGRAMMATIC_FOCUS_WINDOW_MS;
    element.focus(options);
}

/** True while a focus event is most likely the app's own doing. */
export function isProgrammaticFocusActive(): boolean {
    return Date.now() < programmaticFocusUntil;
}
