import speechManager, { Priority } from './speechManager';

export interface SpeakOptions {
    rate?: number;
    lang?: string;
    onEnd?: () => void;
}

/**
 * @deprecated Prefer using `speechManager.speak(text, { priority, owner, ... })` directly
 * so that ownership and priority are explicitly managed.
 */
export function speakThai(text: string, { rate = 1.1, onEnd }: SpeakOptions = {}): void {
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
export function speakText(text: string, { lang = 'th-TH', rate = 1.0, onEnd }: SpeakOptions = {}): void {
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

export function stopSpeaking(): void {
    speechManager?.stopAll();
}
