const NOTE_VALUES = [1000, 500, 100, 50, 20];
const COIN_VALUES = [10, 5, 2, 1];

function cleanGroqText(text: string): string {
    return text
        .replace(/```[\s\S]*?```/g, '')
        .replace(/\*\*/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .trim();
}

function hasDigit(text: string, value: number): boolean {
    return new RegExp(`(?:^|\\D)${value}(?:\\D|$)`).test(text);
}

export interface ParsedCurrency {
    type: 'note' | 'coin' | 'blocked';
    value?: number;
    isBlocked?: boolean;
}

/**
 * Parse raw text response from currency model
 */
export function parseCurrencyResult(text: string | undefined | null): ParsedCurrency | null {
    if (!text) return null;

    const trimmed = cleanGroqText(text).replace(/,/g, '');
    const lower = trimmed.toLowerCase();

    // Check for camera blockage / obstruction
    if (
        trimmed.includes('โดนบัง') ||
        lower.includes('blocked') ||
        lower.includes('covered') ||
        lower.includes('obstructed') ||
        lower.includes('lens covered') ||
        trimmed.includes('มืดสนิท')
    ) {
        return { type: 'blocked', isBlocked: true };
    }

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
    // only a number (note), "เหรียญ N" (coin), or "โดนบัง". Anything longer is likely a
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

export function formatCurrencySpeech(result: ParsedCurrency | null, totalAmount: number | null = null): string {
    if (!result) return '';

    if (result.isBlocked || result.type === 'blocked') {
        return 'กล้องโดนบัง กรุณาเปิดหน้ากล้อง';
    }

    const itemText = result.type === 'coin'
        ? `เหรียญ ${result.value} บาท`
        : `ธนบัตร ${result.value} บาท`;

    if (typeof totalAmount === 'number' && totalAmount > 0) {
        return `${itemText} ยอดรวมสะสม ${totalAmount} บาท`;
    }

    return itemText;
}

export function formatTotalSpeech(totalAmount: number = 0, count: number = 0): string {
    if (!totalAmount || count === 0) {
        return 'ยังไม่มียอดเงินสะสม';
    }
    return `ยอดรวมเงินสะสมทั้งหมด ${totalAmount} บาท จาก ${count} รายการ`;
}

export function formatCurrencyDisplay(result: ParsedCurrency | null, totalAmount: number | null = null): string {
    if (!result) return 'ยังไม่พบเงิน';

    if (result.isBlocked || result.type === 'blocked') {
        return '⚠️ กล้องโดนบัง';
    }

    const itemLabel = result.type === 'coin'
        ? `เหรียญ ${result.value} บาท`
        : `ธนบัตร ${result.value} บาท`;

    if (typeof totalAmount === 'number' && totalAmount > 0) {
        return `${itemLabel} (รวม ฿${totalAmount})`;
    }

    return itemLabel;
}
