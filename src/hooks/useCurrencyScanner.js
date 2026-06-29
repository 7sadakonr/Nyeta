import { useState, useEffect, useRef, useCallback } from 'react';
import { detectCurrencyWithGroq } from '@/lib/currencyGroq';
import { formatCurrencySpeech } from '@/lib/currencyUtils';
import { speakText, stopSpeaking } from '@/lib/tts';

export function useCurrencyScanner(videoRef, enabled, isReady, feedback, addLog, setModeAnnouncement) {
    const [currencyResult, setCurrencyResult] = useState(null);
    const [currencyScanning, setCurrencyScanning] = useState(false);
    const [currencyMonitoring, setCurrencyMonitoring] = useState(false);
    const [currencyHint, setCurrencyHint] = useState('');
    const [currencyBounds, setCurrencyBounds] = useState(null);

    const currencyBusyRef = useRef(false);
    const lastSpokenMoneyRef = useRef('');
    const currencyIntervalRef = useRef(null);
    const stableDetectionRef = useRef({ key: '', count: 0 });
    const notFoundCountRef = useRef(0);
    const currencyErrorCountRef = useRef(0);
    const currencySkipUntilRef = useRef(0);

    useEffect(() => {
        if (!enabled || !isReady) {
            if (currencyIntervalRef.current) {
                clearInterval(currencyIntervalRef.current);
                currencyIntervalRef.current = null;
            }
            currencyBusyRef.current = false;
            setCurrencyScanning(false);
            setCurrencyMonitoring(false);
            stableDetectionRef.current = { key: '', count: 0 };
            return;
        }

        setCurrencyMonitoring(true);
        const apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY;

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
                const { parsed } = await detectCurrencyWithGroq(videoRef.current, apiKey);
                const speechKey = parsed ? `${parsed.type}-${parsed.value}` : 'none';
                currencyErrorCountRef.current = 0;

                if (parsed) {
                    notFoundCountRef.current = 0;

                    if (speechKey === stableDetectionRef.current.key) {
                        stableDetectionRef.current.count += 1;
                    } else {
                        stableDetectionRef.current = { key: speechKey, count: 1 };
                    }

                    const isStable = stableDetectionRef.current.count >= 2;

                    if (isStable) {
                        setCurrencyBounds(null);
                        setCurrencyResult({ ...parsed, source: 'groq' });
                        setCurrencyHint('');

                        if (speechKey !== lastSpokenMoneyRef.current) {
                            const speechText = formatCurrencySpeech(parsed);
                            lastSpokenMoneyRef.current = speechKey;
                            feedback?.('success');
                            speakText(speechText, { rate: 1.1 });
                            setModeAnnouncement?.(speechText);
                        }
                    } else {
                        setCurrencyHint('กำลังยืนยัน...');
                    }
                } else {
                    stableDetectionRef.current = { key: '', count: 0 };
                    notFoundCountRef.current += 1;

                    if (notFoundCountRef.current >= 2) {
                        setCurrencyResult(null);
                        lastSpokenMoneyRef.current = '';
                    }
                    setCurrencyHint('ยังไม่เจอเงิน — ขยับกล้องให้ใกล้และอยู่กลางจอ');
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
        lastSpokenMoneyRef.current = '';
        stableDetectionRef.current = { key: '', count: 0 };
        notFoundCountRef.current = 0;
        currencyErrorCountRef.current = 0;
        currencySkipUntilRef.current = 0;

        const startTimeout = setTimeout(() => scanCurrency(), 300);
        currencyIntervalRef.current = setInterval(scanCurrency, 4000);

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
    }, [enabled, isReady, videoRef, feedback, addLog, setModeAnnouncement]);

    const replayCurrency = useCallback(() => {
        if (!currencyResult) return;
        stopSpeaking();
        const speechText = formatCurrencySpeech(currencyResult);
        speakText(speechText, { rate: 1.1 });
        feedback?.('success');
    }, [currencyResult, feedback]);

    return { currencyResult, currencyScanning, currencyMonitoring, currencyHint, currencyBounds, replayCurrency };
}
