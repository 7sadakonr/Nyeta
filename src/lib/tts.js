export function speakThai(text, { rate = 1.1, onEnd } = {}) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        onEnd?.();
        return;
    }
    if (!text) {
        onEnd?.();
        return;
    }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'th-TH';
    u.rate = rate;
    if (onEnd) {
        u.onend = onEnd;
        u.onerror = onEnd;
    }
    speechSynthesis.speak(u);
}

export function speakText(text, { lang = 'th-TH', rate = 1.0, onEnd } = {}) {
    if (!text || !('speechSynthesis' in window)) {
        onEnd?.();
        return;
    }

    speechSynthesis.cancel();

    // Fix for iOS Safari crash: split long Thai text into small chunks (< 150 chars)
    const words = text.split(/[\n\s]+/).filter(Boolean);
    const chunks = [];
    let currentChunk = '';

    for (const word of words) {
        if (word.length > 150) {
            if (currentChunk) chunks.push(currentChunk);
            for (let i = 0; i < word.length; i += 150) {
                chunks.push(word.substring(i, i + 150));
            }
            currentChunk = '';
        } else if (currentChunk.length + word.length > 150) {
            chunks.push(currentChunk);
            currentChunk = word;
        } else {
            currentChunk += (currentChunk ? ' ' : '') + word;
        }
    }
    if (currentChunk) chunks.push(currentChunk);

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
        
        // Prevent GC crash on iOS Safari
        window.__tts_utterances = window.__tts_utterances || [];
        window.__tts_utterances.push(utterance);

        const handleNext = () => {
            // Remove from global array to allow GC after completion
            window.__tts_utterances = window.__tts_utterances.filter(u => u !== utterance);
            index += 1;
            // Add a small delay between chunks to prevent overwhelming the TTS daemon
            setTimeout(speakNext, 250);
        };

        utterance.onend = handleNext;
        utterance.onerror = handleNext;

        speechSynthesis.speak(utterance);
    };

    speakNext();
}

export function stopSpeaking() {
    if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
    }
}
