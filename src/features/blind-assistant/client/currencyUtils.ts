const NOTE_VALUES = [1000, 500, 100, 50, 20] as const;
const COIN_VALUES = [10, 5, 2, 1] as const;
const MAX_QUANTITY = 100;

export type CurrencyType = 'note' | 'coin';
export type CurrencyLocation =
    | 'top_left' | 'top_center' | 'top_right'
    | 'middle_left' | 'center' | 'middle_right'
    | 'bottom_left' | 'bottom_center' | 'bottom_right';

export interface CurrencyLineItem {
    type: CurrencyType;
    value: number;
    quantity: number;
    locations: CurrencyLocation[];
}

export interface CurrencyBatch {
    items: CurrencyLineItem[];
    total: number;
    signature: string;
}

export type CurrencyScanResult =
    | ({ status: 'detected' } & CurrencyBatch)
    | { status: 'not_found' }
    | { status: 'blocked' }
    | { status: 'invalid' };

const LOCATION_LABELS: Record<CurrencyLocation, string> = {
    top_left: 'ด้านซ้ายบน', top_center: 'ด้านบน', top_right: 'ด้านขวาบน',
    middle_left: 'ด้านซ้าย', center: 'กลางภาพ', middle_right: 'ด้านขวา',
    bottom_left: 'ด้านซ้ายล่าง', bottom_center: 'ด้านล่าง', bottom_right: 'ด้านขวาล่าง',
};

function extractJson(text: string): string | null {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = (fenced?.[1] || text).trim();
    return candidate.startsWith('{') && candidate.endsWith('}') ? candidate : null;
}

function isAllowedValue(type: CurrencyType, value: number): boolean {
    return type === 'note'
        ? (NOTE_VALUES as readonly number[]).includes(value)
        : (COIN_VALUES as readonly number[]).includes(value);
}

function normalizeLocations(value: unknown): CurrencyLocation[] | null {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some(location => typeof location !== 'string' || !(location in LOCATION_LABELS))) return null;
    return [...new Set(value as CurrencyLocation[])];
}

export function createCurrencyBatch(items: CurrencyLineItem[]): CurrencyBatch | null {
    if (items.length === 0) return null;
    const merged = new Map<string, CurrencyLineItem>();
    for (const item of items) {
        if (!isAllowedValue(item.type, item.value) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY) return null;
        const key = `${item.type}-${item.value}`;
        const existing = merged.get(key);
        if (existing) {
            existing.quantity += item.quantity;
            if (existing.quantity > MAX_QUANTITY) return null;
            existing.locations = [...new Set([...existing.locations, ...item.locations])];
        } else {
            merged.set(key, { ...item, locations: [...item.locations] });
        }
    }
    const normalized = [...merged.values()].sort((a, b) => a.type !== b.type ? (a.type === 'note' ? -1 : 1) : b.value - a.value);
    return {
        items: normalized,
        total: normalized.reduce((sum, item) => sum + item.value * item.quantity, 0),
        signature: normalized.map(item => `${item.type}-${item.value}-${item.quantity}`).join('|'),
    };
}

function parseJsonResult(text: string): CurrencyScanResult | null {
    const json = extractJson(text);
    if (!json) return null;
    let parsed: unknown;
    try { parsed = JSON.parse(json); } catch { return { status: 'invalid' }; }
    if (!parsed || typeof parsed !== 'object') return { status: 'invalid' };
    const result = parsed as Record<string, unknown>;
    if (result.status === 'not_found') return { status: 'not_found' };
    if (result.status === 'blocked') return { status: 'blocked' };
    if (result.status !== 'ok' || !Array.isArray(result.items)) return { status: 'invalid' };
    const items: CurrencyLineItem[] = [];
    for (const rawItem of result.items) {
        if (!rawItem || typeof rawItem !== 'object') return { status: 'invalid' };
        const item = rawItem as Record<string, unknown>;
        if ((item.type !== 'note' && item.type !== 'coin') || typeof item.value !== 'number' || typeof item.quantity !== 'number') return { status: 'invalid' };
        const locations = normalizeLocations(item.locations);
        if (!locations) return { status: 'invalid' };
        items.push({ type: item.type, value: item.value, quantity: item.quantity, locations });
    }
    const batch = createCurrencyBatch(items);
    return batch ? { status: 'detected', ...batch } : { status: 'invalid' };
}

function parseLegacyResult(text: string): CurrencyScanResult {
    const trimmed = text.replace(/\*\*/g, '').trim();
    const lower = trimmed.toLowerCase();
    if (trimmed.includes('โดนบัง') || lower.includes('blocked') || lower.includes('covered') || lower.includes('obstructed') || trimmed.includes('มืดสนิท')) return { status: 'blocked' };
    if (trimmed.includes('ไม่พบ') || lower.includes('not found') || lower === 'none' || lower.includes('no thai') || lower.includes('cannot see') || lower.includes("can't see")) return { status: 'not_found' };
    if (trimmed.length > 30) return { status: 'invalid' };
    const match = trimmed.match(/^(?:(ธนบัตร|banknote|note|เหรียญ|coin)\s*)?(\d+)$/i);
    if (!match) return { status: 'invalid' };
    const value = Number(match[2]);
    const type: CurrencyType = /เหรียญ|coin/i.test(match[1] || '') || (!(NOTE_VALUES as readonly number[]).includes(value) && (COIN_VALUES as readonly number[]).includes(value)) ? 'coin' : 'note';
    const batch = createCurrencyBatch([{ type, value, quantity: 1, locations: [] }]);
    return batch ? { status: 'detected', ...batch } : { status: 'invalid' };
}

/** Parse a structured currency response, with support for legacy single-value replies. */
export function parseCurrencyResult(text: string | undefined | null): CurrencyScanResult {
    if (!text?.trim()) return { status: 'invalid' };
    return parseJsonResult(text) || parseLegacyResult(text);
}

export function formatCurrencyItem(item: CurrencyLineItem, includeLocations = false): string {
    const label = item.type === 'note' ? 'ธนบัตร' : 'เหรียญ';
    const unit = item.type === 'note' ? 'ใบ' : 'เหรียญ';
    const locations = includeLocations && item.locations.length > 0 ? ` อยู่${item.locations.map(location => LOCATION_LABELS[location]).join(' และ')}` : '';
    return `${label} ${item.value} บาท ${item.quantity} ${unit}${locations}`;
}

export function formatCurrencySpeech(result: CurrencyBatch | null, totalAmount: number | null = null, includeLocations = false): string {
    if (!result) return '';
    const batchText = `${result.items.map(item => formatCurrencyItem(item, includeLocations)).join(' และ')} รวมชุดนี้ ${result.total} บาท`;
    return typeof totalAmount === 'number' && totalAmount > 0 ? `${batchText} ยอดรวมสะสม ${totalAmount} บาท` : batchText;
}

export function formatCurrencyDisplay(result: CurrencyBatch | null): string {
    if (!result) return 'ยังไม่พบเงิน';
    return result.items.map(item => `${item.type === 'note' ? 'ธนบัตร' : 'เหรียญ'} ${item.value} × ${item.quantity}`).join(' + ');
}

export function formatTotalSpeech(totalAmount = 0, count = 0): string {
    return !totalAmount || count === 0 ? 'ยังไม่มียอดเงินสะสม' : `ยอดรวมเงินสะสมทั้งหมด ${totalAmount} บาท จาก ${count} ชิ้น`;
}