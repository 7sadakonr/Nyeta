const NOTE_VALUES = [1000, 500, 100, 50, 20];
const COIN_VALUES = [10, 5, 2, 1];

function cleanGroqText(text) {
    return text
        .replace(/```[\s\S]*?```/g, '')
        .replace(/\*\*/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .trim();
}

function hasDigit(text, value) {
    return new RegExp(`(?:^|\\D)${value}(?:\\D|$)`).test(text);
}

/**
 * @param {string | undefined | null} text
 * @returns {{ type: 'note' | 'coin', value: number } | null}
 */
export function parseCurrencyResult(text) {
    if (!text) return null;

    const trimmed = cleanGroqText(text);
    const lower = trimmed.toLowerCase();

    if (
        trimmed.includes('ไม่พบ') ||
        lower.includes('not found') ||
        lower.includes('none') ||
        lower.includes('no thai') ||
        lower.includes('cannot see') ||
        lower.includes("can't see")
    ) {
        return null;
    }

    // Reject long descriptive responses — prompt instructs the model to reply with
    // only a number (note) or "เหรียญ N" (coin). Anything longer is likely a
    // hallucinated paragraph and should not be parsed.
    if (trimmed.length > 30) return null;

    const coinMatch = trimmed.match(/(?:เหรียญ|coin)\s*(\d+)/i);
    if (coinMatch) {
        const value = parseInt(coinMatch[1], 10);
        if (COIN_VALUES.includes(value)) return { type: 'coin', value };
        return null;
    }

    const noteMatch = trimmed.match(/(?:ธนบัตร|banknote|note)\s*(\d+)/i);
    if (noteMatch) {
        const value = parseInt(noteMatch[1], 10);
        if (NOTE_VALUES.includes(value)) return { type: 'note', value };
        return null;
    }

    const isCoinContext = /เหรียญ|\bcoin\b/i.test(trimmed);

    if (isCoinContext) {
        for (const value of COIN_VALUES) {
            if (hasDigit(trimmed, value)) {
                return { type: 'coin', value };
            }
        }
    }

    for (const value of NOTE_VALUES) {
        if (hasDigit(trimmed, value)) {
            return { type: 'note', value };
        }
    }

    for (const value of COIN_VALUES) {
        if (hasDigit(trimmed, value)) {
            return { type: 'coin', value };
        }
    }

    // Only use numeric fallback when the response is a bare number with nothing else
    const bareNumber = trimmed.match(/^\s*(\d+)\s*$/);
    if (bareNumber) {
        const value = parseInt(bareNumber[1], 10);
        if (NOTE_VALUES.includes(value)) return { type: 'note', value };
        if (COIN_VALUES.includes(value)) return { type: 'coin', value };
    }

    return null;
}

export function formatCurrencySpeech(result) {
    if (!result) return '';

    if (result.type === 'coin') {
        return `เหรียญ ${result.value} บาท`;
    }

    return `ธนบัตร ${result.value} บาท`;
}

export function formatCurrencyDisplay(result) {
    if (!result) return 'ยังไม่พบเงิน';

    if (result.type === 'coin') {
        return `เหรียญ ${result.value} บาท`;
    }

    return `ธนบัตร ${result.value} บาท`;
}
