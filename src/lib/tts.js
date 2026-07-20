import speechManager, { Priority } from './speechManager';

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
