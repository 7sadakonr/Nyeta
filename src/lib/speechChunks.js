export function speakText(text, { lang = 'th-TH', rate = 1.0, onEnd } = {}) {
    if (!text || !('speechSynthesis' in window)) {
        onEnd?.();
        return;
    }

    speechSynthesis.cancel();

    const chunks = text
        .split(/(?<=[.!?。]\s*|\n{2,})/)
        .map((chunk) => chunk.trim())
        .filter(Boolean);

    if (chunks.length === 0) {
        onEnd?.();
        return;
    }

    let index = 0;

    const speakNext = () => {
        if (index >= chunks.length) {
            onEnd?.();
            return;
        }

        const utterance = new SpeechSynthesisUtterance(chunks[index]);
        utterance.lang = lang;
        utterance.rate = rate;
        utterance.onend = () => {
            index += 1;
            speakNext();
        };
        utterance.onerror = () => {
            index += 1;
            speakNext();
        };

        speechSynthesis.speak(utterance);
    };

    speakNext();
}

export function stopSpeaking() {
    if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
    }
}
