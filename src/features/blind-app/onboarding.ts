const ONBOARDED_KEY = 'nyeta_onboarded';

/** Whether this device already went through the welcome / permission screen. Storage can be blocked, so never throw. */
export function hasCompletedOnboarding(): boolean {
    try {
        return window.localStorage.getItem(ONBOARDED_KEY) === '1';
    } catch {
        return false;
    }
}

export function markOnboardingComplete(): void {
    try {
        window.localStorage.setItem(ONBOARDED_KEY, '1');
    } catch {
        // Ignore: the welcome screen simply shows again next time.
    }
}
