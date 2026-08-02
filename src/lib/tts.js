import speechManager, { Priority } from './speechManager';

/**
 * @deprecated Prefer using `speechManager.speak(text, { priority, owner, ... })` directly
 * so that ownership and priority are explicitly managed.
 */
export function speakThai(text, { rate = 1.1, onEnd } = {}) {
    if (!speechManager) {
        onEnd?.();
        return;
    }
    speechManager.speak(text, {
        priority: Priority.LOW,
        owner: 'guidance',
        rate,
        onEnd,
    });
}

/**
 * @deprecated Prefer using `speechManager.speak(text, { priority, owner, chunk: true, ... })` directly.
 */
export function speakText(text, { lang = 'th-TH', rate = 1.0, onEnd } = {}) {
    if (!speechManager) {
        onEnd?.();
        return;
    }

    speechManager.speak(text, {
        priority: Priority.NORMAL,
        owner: 'document',
        rate,
        lang,
        chunk: true,
        onEnd,
    });
}

export function stopSpeaking() {
    speechManager?.stopAll();
}
