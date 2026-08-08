import { describe, it, expect } from 'vitest';
import { createCurrencyBatch, formatCurrencyDisplay, formatCurrencySpeech, formatTotalSpeech, parseCurrencyResult } from '@/features/blind-assistant/client/currencyUtils';

describe('Currency Utilities', () => {
    it('parses, merges, and normalizes a multi-item JSON result', () => {
        const result = parseCurrencyResult('```json\n{"status":"ok","items":[{"type":"coin","value":10,"quantity":1,"locations":["bottom_left"]},{"type":"note","value":100,"quantity":1,"locations":["center"]},{"type":"note","value":100,"quantity":1,"locations":["middle_right"]}]}\n```');
        expect(result).toEqual({
            status: 'detected', total: 210, signature: 'note-100-2|coin-10-1',
            items: [
                { type: 'note', value: 100, quantity: 2, locations: ['center', 'middle_right'] },
                { type: 'coin', value: 10, quantity: 1, locations: ['bottom_left'] },
            ],
        });
    });

    it('supports legacy single-item responses', () => {
        expect(parseCurrencyResult('100')).toMatchObject({ status: 'detected', total: 100, items: [{ type: 'note', value: 100, quantity: 1 }] });
        expect(parseCurrencyResult('เหรียญ 10')).toMatchObject({ status: 'detected', total: 10, items: [{ type: 'coin', value: 10, quantity: 1 }] });
    });

    it('keeps no-money, blocked, and malformed responses distinct', () => {
        expect(parseCurrencyResult('{"status":"not_found"}')).toEqual({ status: 'not_found' });
        expect(parseCurrencyResult('โดนบัง')).toEqual({ status: 'blocked' });
        expect(parseCurrencyResult('{"status":"ok","items":[{"type":"note","value":99,"quantity":1}]}')).toEqual({ status: 'invalid' });
        expect(parseCurrencyResult('{"status":"ok","items":[{"type":"coin","value":10,"quantity":1.5}]}')).toEqual({ status: 'invalid' });
    });

    it('rejects an invalid location or an empty batch', () => {
        expect(parseCurrencyResult('{"status":"ok","items":[{"type":"note","value":100,"quantity":1,"locations":["somewhere"]}]}')).toEqual({ status: 'invalid' });
        expect(createCurrencyBatch([])).toBeNull();
    });

    it('formats identified money, locations, and totals without color information', () => {
        const batch = createCurrencyBatch([{ type: 'note', value: 100, quantity: 2, locations: ['center'] }, { type: 'coin', value: 10, quantity: 1, locations: ['bottom_left'] }]);
        expect(formatCurrencyDisplay(batch)).toBe('ธนบัตร 100 × 2 + เหรียญ 10 × 1');
        expect(formatCurrencySpeech(batch, 210, true)).toBe('ธนบัตร 100 บาท 2 ใบ อยู่กลางภาพ และเหรียญ 10 บาท 1 เหรียญ อยู่ด้านซ้ายล่าง รวมชุดนี้ 210 บาท ยอดรวมสะสม 210 บาท');
        expect(formatTotalSpeech(210, 3)).toBe('ยอดรวมเงินสะสมทั้งหมด 210 บาท จาก 3 ชิ้น');
    });
});