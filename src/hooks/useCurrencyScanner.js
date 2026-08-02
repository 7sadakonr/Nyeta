import { useState, useEffect, useRef, useCallback } from 'react';
import { detectCurrencyWithGemini } from '@/lib/currencyGemini';
import { formatCurrencySpeech, formatTotalSpeech } from '@/lib/currencyUtils';
import speechManager, { Priority } from '@/lib/speechManager';

export function useCurrencyScanner(videoRef, enabled, isReady, feedback, addLog) {
    const [currencyResult, setCurrencyResult] = useState(null);
    const [currencyScanning, setCurrencyScanning] = useState(false);
    const [currencyMonitoring, setCurrencyMonitoring] = useState(false);
    const [currencyHint, setCurrencyHint] = useState('');
    const [currencyBounds, setCurrencyBounds] = useState(null);
    const [totalAmount, setTotalAmount] = useState(0);
    const [scannedHistory, setScannedHistory] = useState([]);
    const [isBlocked, setIsBlocked] = useState(false);

    const currencyBusyRef = useRef(false);
    const lastSpokenMoneyRef = useRef('');
    const lastAddedKeyRef = useRef('');
    const lastBlockedSpokenRef = useRef(0);
    const currencyIntervalRef = useRef(null);
    const stableDetectionRef = useRef({ key: '', count: 0 });
    const notFoundCountRef = useRef(0);
    const currencyErrorCountRef = useRef(0);
    const currencySkipUntilRef = useRef(0);

    const totalAmountRef = useRef(0);
    totalAmountRef.current = totalAmount;

    const scannedHistoryRef = useRef([]);
    scannedHistoryRef.current = scannedHistory;

    useEffect(() => {
        if (!enabled || !isReady) {
            if (currencyIntervalRef.current) {
                clearInterval(currencyIntervalRef.current);
                currencyIntervalRef.current = null;
            }
            currencyBusyRef.current = false;
            setCurrencyScanning(false);
            setCurrencyMonitoring(false);
            setIsBlocked(false);
            stableDetectionRef.current = { key: '', count: 0 };
            return;
        }

        setCurrencyMonitoring(true);
        const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

        const scanCurrency = async () => {
            if (currencyBusyRef.current) return;
            if (Date.now() < currencySkipUntilRef.current) return;
            if (!videoRef.current || videoRef.current.readyState < 2) return;

            if (!apiKey) {
                setCurrencyHint('ไม่พบ API Key');
                return;
            }

            currencyBusyRef.current = true;
            setCurrencyScanning(true);

            try {
                const { parsed, isBlocked: frameBlocked } = await detectCurrencyWithGemini(videoRef.current, apiKey);
                currencyErrorCountRef.current = 0;

                // Handle Camera Blockage / Obstruction
                if (frameBlocked || parsed?.isBlocked || parsed?.type === 'blocked') {
                    setIsBlocked(true);
                    setCurrencyHint('⚠️ กล้องโดนบัง กรุณาเปิดหน้ากล้อง');
                    stableDetectionRef.current = { key: '', count: 0 };
                    notFoundCountRef.current = 0;

                    // Throttle blockage speech every 5 seconds
                    if (Date.now() - lastBlockedSpokenRef.current > 5000) {
                        lastBlockedSpokenRef.current = Date.now();
                        feedback?.('error');
                        speechManager?.speak('กล้องโดนบัง กรุณาเปิดหน้ากล้อง', {
                            priority: Priority.HIGH,
                            owner: 'currency-blocked',
                            rate: 1.1,
                        });
                    }
                    return;
                }

                setIsBlocked(false);

                if (parsed && typeof parsed.value === 'number') {
                    const speechKey = `${parsed.type}-${parsed.value}`;
                    notFoundCountRef.current = 0;

                    if (speechKey === stableDetectionRef.current.key) {
                        stableDetectionRef.current.count += 1;
                    } else {
                        stableDetectionRef.current = { key: speechKey, count: 1 };
                    }

                    const isStable = stableDetectionRef.current.count >= 2;

                    if (isStable) {
                        setCurrencyBounds(null);
                        setCurrencyResult({ ...parsed, source: 'gemini' });
                        setCurrencyHint('');

                        // Auto-accumulate to running total if this is a new bill/item
                        let currentTotal = totalAmountRef.current;
                        if (speechKey !== lastAddedKeyRef.current) {
                            const newTotal = currentTotal + parsed.value;
                            currentTotal = newTotal;
                            setTotalAmount(newTotal);
                            setScannedHistory(prev => [
                                ...prev,
                                { id: Date.now(), type: parsed.type, value: parsed.value, timestamp: Date.now() },
                            ]);
                            lastAddedKeyRef.current = speechKey;
                        }

                        if (speechKey !== lastSpokenMoneyRef.current) {
                            const speechText = formatCurrencySpeech(parsed, currentTotal);
                            lastSpokenMoneyRef.current = speechKey;
                            feedback?.('success');
                            speechManager?.speak(speechText, {
                                priority: Priority.HIGH,
                                owner: 'currency',
                                rate: 1.1,
                            });
                        }
                    } else {
                        setCurrencyHint('กำลังยืนยัน...');
                    }
                } else {
                    stableDetectionRef.current = { key: '', count: 0 };
                    notFoundCountRef.current += 1;

                    // When bill is removed for 2 cycles, reset last added key so the next bill can be counted
                    if (notFoundCountRef.current >= 2) {
                        setCurrencyResult(null);
                        lastSpokenMoneyRef.current = '';
                        lastAddedKeyRef.current = '';
                    }
                    setCurrencyHint('ยังไม่เจอเงิน — ขยับกล้องให้เห็นธนบัตรหรือเหรียญ');
                }
            } catch (error) {
                console.error('Currency scan error:', error);
                addLog?.(`Currency scan error: ${error.message}`);
                stableDetectionRef.current = { key: '', count: 0 };
                currencyErrorCountRef.current += 1;

                const isRateLimit = error.status === 429 || /rate limit/i.test(error.message);
                const isNetwork = /failed to fetch|network/i.test(error.message);
                const backoffMs = isRateLimit
                    ? 12000
                    : Math.min(6000 * currencyErrorCountRef.current, 18000);
                currencySkipUntilRef.current = Date.now() + backoffMs;

                if (currencyErrorCountRef.current >= 3) {
                    setCurrencyHint('ไม่สามารถเชื่อมต่อ AI ได้');
                } else if (isRateLimit) {
                    setCurrencyHint('AI ทำงานหนัก รอสักครู่...');
                } else if (isNetwork) {
                    setCurrencyHint('ไม่มีเน็ต');
                } else {
                    setCurrencyHint('สแกนไม่สำเร็จ');
                }
            } finally {
                currencyBusyRef.current = false;
                setCurrencyScanning(false);
            }
        };

        setCurrencyResult(null);
        setCurrencyBounds(null);
        setCurrencyHint('');
        setIsBlocked(false);
        lastSpokenMoneyRef.current = '';
        lastAddedKeyRef.current = '';
        lastBlockedSpokenRef.current = 0;
        stableDetectionRef.current = { key: '', count: 0 };
        notFoundCountRef.current = 0;
        currencyErrorCountRef.current = 0;
        currencySkipUntilRef.current = 0;

        const startTimeout = setTimeout(() => scanCurrency(), 300);
        currencyIntervalRef.current = setInterval(scanCurrency, 3500);

        return () => {
            clearTimeout(startTimeout);
            if (currencyIntervalRef.current) {
                clearInterval(currencyIntervalRef.current);
                currencyIntervalRef.current = null;
            }
            currencyBusyRef.current = false;
            setCurrencyScanning(false);
            setCurrencyMonitoring(false);
        };
    }, [enabled, isReady, videoRef, feedback, addLog]);

    const replayCurrency = useCallback(() => {
        if (!currencyResult) return;
        speechManager?.stopAll();
        const speechText = formatCurrencySpeech(currencyResult, totalAmount);
        speechManager?.speak(speechText, {
            priority: Priority.HIGH,
            owner: 'currency',
            rate: 1.1,
        });
        feedback?.('success');
    }, [currencyResult, totalAmount, feedback]);

    const replayTotal = useCallback(() => {
        speechManager?.stopAll();
        const speechText = formatTotalSpeech(totalAmount, scannedHistory.length);
        speechManager?.speak(speechText, {
            priority: Priority.HIGH,
            owner: 'currency-total',
            rate: 1.1,
        });
        feedback?.('capture');
    }, [totalAmount, scannedHistory.length, feedback]);

    const clearTotal = useCallback(() => {
        setTotalAmount(0);
        setScannedHistory([]);
        lastAddedKeyRef.current = '';
        speechManager?.stopAll();
        speechManager?.speak('ล้างยอดเงินสะสมแล้ว', {
            priority: Priority.HIGH,
            owner: 'currency-reset',
            rate: 1.1,
        });
        feedback?.('end');
    }, [feedback]);

    return {
        currencyResult,
        currencyScanning,
        currencyMonitoring,
        currencyHint,
        currencyBounds,
        totalAmount,
        scannedHistory,
        isBlocked,
        replayCurrency,
        replayTotal,
        clearTotal,
    };
}

