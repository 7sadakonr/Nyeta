import { useState, useRef, useCallback, RefObject } from 'react';
import { detectCurrencyWithGemini } from '@/features/blind-assistant/client/currencyGemini';
import { CurrencyBatch, formatCurrencySpeech, formatTotalSpeech } from '@/features/blind-assistant/client/currencyUtils';
import speechManager, { Priority } from '@/shared/accessibility/speechManager';
import { BoundingBox } from '@/features/blind-assistant/types/assistant';
import { EarconType } from '@/shared/accessibility/audio';

export interface CapturedCurrency extends CurrencyBatch { captureId: number; source: 'gemini'; }
export interface CurrencyHistoryItem extends CurrencyBatch { id: number; timestamp: number; }
export interface UseCurrencyScannerResult {
    currencyResult: CapturedCurrency | null; currencyScanning: boolean; currencyMonitoring: boolean;
    currencyHint: string; currencyBounds: BoundingBox | null; totalAmount: number; scannedHistory: CurrencyHistoryItem[];
    scannedCount: number; isBlocked: boolean; detailsOpen: boolean;
    captureCurrency: () => Promise<void>; showCurrencyDetails: () => void; closeCurrencyDetails: () => void;
    replayTotal: () => void; clearTotal: () => void;
}

export function useCurrencyScanner(videoRef: RefObject<HTMLVideoElement | null>, enabled: boolean, isReady: boolean, feedback?: (type: EarconType) => void, addLog?: (msg: string) => void): UseCurrencyScannerResult {
    const [currencyResult, setCurrencyResult] = useState<CapturedCurrency | null>(null);
    const [currencyScanning, setCurrencyScanning] = useState(false);
    const [currencyHint, setCurrencyHint] = useState('');
    const [totalAmount, setTotalAmount] = useState(0);
    const [scannedHistory, setScannedHistory] = useState<CurrencyHistoryItem[]>([]);
    const [isBlocked, setIsBlocked] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const busyRef = useRef(false);
    const totalRef = useRef(0);
    const resultRef = useRef<CapturedCurrency | null>(null);
    const historyRef = useRef<CurrencyHistoryItem[]>([]);
    const setResult = (result: CapturedCurrency | null) => { resultRef.current = result; setCurrencyResult(result); };

    const captureCurrency = useCallback(async () => {
        if (!enabled || !isReady || busyRef.current) return;
        busyRef.current = true;
        setCurrencyScanning(true);
        setCurrencyHint('กำลังตรวจเงิน');
        setIsBlocked(false);
        setDetailsOpen(false);
        setResult(null);
        feedback?.('capture');
        speechManager?.speak('กำลังตรวจเงิน', { priority: Priority.HIGH, owner: 'currency', rate: 1.1 });
        try {
            const { result } = await detectCurrencyWithGemini(videoRef.current);
            if (result.status === 'detected') {
                const captured: CapturedCurrency = { ...result, captureId: Date.now(), source: 'gemini' };
                const entry: CurrencyHistoryItem = { items: captured.items, total: captured.total, signature: captured.signature, id: captured.captureId, timestamp: Date.now() };
                const newTotal = totalRef.current + captured.total;
                totalRef.current = newTotal;
                historyRef.current = [...historyRef.current, entry];
                setResult(captured);
                setTotalAmount(newTotal);
                setScannedHistory(historyRef.current);
                setCurrencyHint(`รวมยอด ${captured.total} บาทแล้ว`);
                feedback?.('success');
                speechManager?.speak(`ครั้งนี้ ${captured.total} บาท ยอดรวมสะสม ${newTotal} บาท`, { priority: Priority.HIGH, owner: 'currency', rate: 1.1 });
            } else if (result.status === 'blocked') {
                setIsBlocked(true);
                setCurrencyHint('กล้องโดนบัง กรุณาเปิดหน้ากล้อง');
                feedback?.('error');
                speechManager?.speak('กล้องโดนบัง กรุณาเปิดหน้ากล้องแล้วถ่ายใหม่', { priority: Priority.HIGH, owner: 'currency', rate: 1.1 });
            } else if (result.status === 'not_found') {
                setCurrencyHint('ยังไม่พบเงินในภาพ กรุณาจัดเงินในโซนสแกนแล้วถ่ายใหม่');
                speechManager?.speak('ยังไม่พบเงินในภาพ กรุณาจัดเงินในโซนสแกนแล้วถ่ายใหม่', { priority: Priority.HIGH, owner: 'currency', rate: 1.1 });
            } else {
                setCurrencyHint('อ่านผลไม่สำเร็จ กรุณาถ่ายใหม่');
                feedback?.('error');
                speechManager?.speak('อ่านผลไม่สำเร็จ กรุณาถ่ายใหม่', { priority: Priority.HIGH, owner: 'currency', rate: 1.1 });
            }
        } catch (error: any) {
            addLog?.(`Currency capture error: ${error.message}`);
            const message = /failed to fetch|network/i.test(error.message) ? 'ไม่มีเน็ต กรุณาลองใหม่' : 'สแกนไม่สำเร็จ กรุณาถ่ายใหม่';
            setCurrencyHint(message);
            feedback?.('error');
            speechManager?.speak(message, { priority: Priority.HIGH, owner: 'currency', rate: 1.1 });
        } finally {
            busyRef.current = false;
            setCurrencyScanning(false);
        }
    }, [enabled, isReady, videoRef, feedback, addLog]);

    const showCurrencyDetails = useCallback(() => {
        if (!resultRef.current) return;
        setDetailsOpen(true);
        speechManager?.speak(formatCurrencySpeech(resultRef.current, null, true), { priority: Priority.HIGH, owner: 'currency-details', rate: 1.1 });
    }, []);
    const closeCurrencyDetails = useCallback(() => setDetailsOpen(false), []);
    const replayTotal = useCallback(() => {
        speechManager?.speak(formatTotalSpeech(totalRef.current, historyRef.current.reduce((count, item) => count + item.items.reduce((sum, currency) => sum + currency.quantity, 0), 0)), { priority: Priority.HIGH, owner: 'currency-total', rate: 1.1 });
        feedback?.('capture');
    }, [feedback]);
    const clearTotal = useCallback(() => {
        totalRef.current = 0;
        historyRef.current = [];
        setTotalAmount(0);
        setScannedHistory([]);
        speechManager?.speak('ล้างยอดเงินสะสมแล้ว', { priority: Priority.HIGH, owner: 'currency-reset', rate: 1.1 });
        feedback?.('end');
    }, [feedback]);
    const scannedCount = scannedHistory.reduce((count, batch) => count + batch.items.reduce((sum, item) => sum + item.quantity, 0), 0);
    return { currencyResult, currencyScanning, currencyMonitoring: false, currencyHint, currencyBounds: null, totalAmount, scannedHistory, scannedCount, isBlocked, detailsOpen, captureCurrency, showCurrencyDetails, closeCurrencyDetails, replayTotal, clearTotal };
}
