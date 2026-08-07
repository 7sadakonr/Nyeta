import { describe, it, expect } from 'vitest';
import {
    parseCurrencyResult,
    formatCurrencySpeech,
    formatTotalSpeech,
    formatCurrencyDisplay,
} from '@/lib/currencyUtils';

describe('Currency Utilities', () => {
    describe('parseCurrencyResult', () => {
        it('should parse banknotes correctly', () => {
            expect(parseCurrencyResult('100')).toEqual({ type: 'note', value: 100 });
            expect(parseCurrencyResult('500')).toEqual({ type: 'note', value: 500 });
            expect(parseCurrencyResult('ธนบัตร 20')).toEqual({ type: 'note', value: 20 });
            expect(parseCurrencyResult('1000')).toEqual({ type: 'note', value: 1000 });
        });

        it('should parse coins correctly', () => {
            expect(parseCurrencyResult('เหรียญ 10')).toEqual({ type: 'coin', value: 10 });
            expect(parseCurrencyResult('เหรียญ 5')).toEqual({ type: 'coin', value: 5 });
            expect(parseCurrencyResult('เหรียญ 2')).toEqual({ type: 'coin', value: 2 });
            expect(parseCurrencyResult('เหรียญ 1')).toEqual({ type: 'coin', value: 1 });
        });

        it('should parse camera blockage', () => {
            expect(parseCurrencyResult('โดนบัง')).toEqual({ type: 'blocked', isBlocked: true });
            expect(parseCurrencyResult('กล้องโดนบัง')).toEqual({ type: 'blocked', isBlocked: true });
            expect(parseCurrencyResult('blocked')).toEqual({ type: 'blocked', isBlocked: true });
        });

        it('should return null when no currency is found or text is empty', () => {
            expect(parseCurrencyResult('ไม่พบ')).toBeNull();
            expect(parseCurrencyResult('none')).toBeNull();
            expect(parseCurrencyResult('')).toBeNull();
            expect(parseCurrencyResult(null)).toBeNull();
        });
    });

    describe('formatCurrencySpeech', () => {
        it('should format speech text for banknote with total', () => {
            const speech = formatCurrencySpeech({ type: 'note', value: 100 }, 250);
            expect(speech).toBe('ธนบัตร 100 บาท ยอดรวมสะสม 250 บาท');
        });

        it('should format speech text for coin', () => {
            const speech = formatCurrencySpeech({ type: 'coin', value: 10 });
            expect(speech).toBe('เหรียญ 10 บาท');
        });

        it('should format blockage announcement', () => {
            const speech = formatCurrencySpeech({ type: 'blocked', isBlocked: true });
            expect(speech).toBe('กล้องโดนบัง กรุณาเปิดหน้ากล้อง');
        });
    });

    describe('formatTotalSpeech & formatCurrencyDisplay', () => {
        it('should format total speech summary', () => {
            expect(formatTotalSpeech(120, 2)).toBe('ยอดรวมเงินสะสมทั้งหมด 120 บาท จาก 2 รายการ');
            expect(formatTotalSpeech(0, 0)).toBe('ยังไม่มียอดเงินสะสม');
        });

        it('should format currency display text', () => {
            expect(formatCurrencyDisplay({ type: 'note', value: 50 }, 150)).toBe('ธนบัตร 50 บาท (รวม ฿150)');
            expect(formatCurrencyDisplay(null)).toBe('ยังไม่พบเงิน');
        });
    });
});
