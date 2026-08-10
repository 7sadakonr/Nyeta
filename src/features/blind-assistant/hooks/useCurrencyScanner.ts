import { useState, useRef, useCallback, useEffect, RefObject } from 'react';
import { analyzeCurrencyFrame, detectCurrencyWithGemini, hasCurrencySceneChanged } from '@/features/blind-assistant/client/currencyGemini';
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

type CurrencyScanPhase = 'idle' | 'searching' | 'checking' | 'waiting-removal' | 'paused';
type RequestSource = 'auto' | 'manual';

const ANALYSIS_INTERVAL_MS = 160;
const FALLBACK_PROBE_MS = 5000;
const AUTO_REQUEST_INTERVAL_MS = 3250;
const BLOCKED_ANNOUNCEMENT_MS = 2000;
const NETWORK_BACKOFF_MS = [2000, 4000, 8000, 16000, 30000];

export function useCurrencyScanner(videoRef: RefObject<HTMLVideoElement | null>, enabled: boolean, isReady: boolean, feedback?: (type: EarconType) => void, addLog?: (msg: string) => void): UseCurrencyScannerResult {
    const [currencyResult, setCurrencyResult] = useState<CapturedCurrency | null>(null);
    const [phase, setPhase] = useState<CurrencyScanPhase>('idle');
    const [currencyHint, setCurrencyHint] = useState('');
    const [totalAmount, setTotalAmount] = useState(0);
    const [scannedHistory, setScannedHistory] = useState<CurrencyHistoryItem[]>([]);
    const [isBlocked, setIsBlocked] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);

    const enabledRef = useRef(enabled);
    const readyRef = useRef(isReady);
    const visibleRef = useRef(typeof document === 'undefined' || document.visibilityState !== 'hidden');
    const phaseRef = useRef<CurrencyScanPhase>('idle');
    const resumePhaseRef = useRef<CurrencyScanPhase>('searching');
    const generationRef = useRef(0);
    const requestRef = useRef<{ id: number; generation: number; controller: AbortController; returnPhase: 'searching' | 'waiting-removal'; fingerprint: Uint8Array; source: RequestSource } | null>(null);
    const requestIdRef = useRef(0);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const totalRef = useRef(0);
    const resultRef = useRef<CapturedCurrency | null>(null);
    const historyRef = useRef<CurrencyHistoryItem[]>([]);
    const hintRef = useRef('');
    const blockedRef = useRef(false);
    const blockedSinceRef = useRef(0);
    const blockedAnnouncedRef = useRef(false);
    const readyAnnouncedRef = useRef(false);
    const lastProbeFingerprintRef = useRef<Uint8Array | null>(null);
    const lastProbeAtRef = useRef(0);
    const removalBaselineRef = useRef<Uint8Array | null>(null);
    const removalNotFoundCountRef = useRef(0);
    const removalConfirmAtRef = useRef(0);
    const retryAtRef = useRef(0);
    const networkFailureCountRef = useRef(0);
    const networkAnnouncedRef = useRef(false);

    enabledRef.current = enabled;
    readyRef.current = isReady;

    const setPhaseIfChanged = useCallback((next: CurrencyScanPhase) => {
        if (phaseRef.current === next) return;
        phaseRef.current = next;
        setPhase(next);
    }, []);
    const setHintIfChanged = useCallback((next: string) => {
        if (hintRef.current === next) return;
        hintRef.current = next;
        setCurrencyHint(next);
    }, []);
    const setBlockedIfChanged = useCallback((next: boolean) => {
        if (blockedRef.current === next) return;
        blockedRef.current = next;
        setIsBlocked(next);
    }, []);
    const setResult = useCallback((result: CapturedCurrency | null) => {
        resultRef.current = result;
        setCurrencyResult(result);
    }, []);
    const isActive = useCallback(() => enabledRef.current && readyRef.current && visibleRef.current, []);

    const cancelPendingRequest = useCallback(() => {
        generationRef.current += 1;
        requestRef.current?.controller.abort();
        requestRef.current = null;
    }, []);

    const markBlocked = useCallback(() => {
        setBlockedIfChanged(true);
        if (!blockedSinceRef.current) blockedSinceRef.current = Date.now();
        if (!blockedAnnouncedRef.current && Date.now() - blockedSinceRef.current >= BLOCKED_ANNOUNCEMENT_MS) {
            blockedAnnouncedRef.current = true;
            setHintIfChanged('กล้องโดนบัง กรุณาเปิดหน้ากล้อง');
            speechManager?.speak('กล้องโดนบัง กรุณาเปิดหน้ากล้อง', { priority: Priority.HIGH, owner: 'currency', rate: 1.1 });
        }
    }, [setBlockedIfChanged, setHintIfChanged]);

    const clearBlocked = useCallback(() => {
        blockedSinceRef.current = 0;
        blockedAnnouncedRef.current = false;
        setBlockedIfChanged(false);
    }, [setBlockedIfChanged]);

    const finishRemoval = useCallback(() => {
        removalNotFoundCountRef.current = 0;
        removalConfirmAtRef.current = 0;
        removalBaselineRef.current = null;
        lastProbeFingerprintRef.current = null;
        setResult(null);
        setDetailsOpen(false);
        setHintIfChanged('พร้อมสแกนใบถัดไป');
        setPhaseIfChanged('searching');
        speechManager?.speak('พร้อมสแกนใบถัดไป', { priority: Priority.HIGH, owner: 'currency', rate: 1.1 });
    }, [setHintIfChanged, setPhaseIfChanged, setResult]);

    const requestProbe = useCallback(async (source: RequestSource, fingerprint: Uint8Array, returnPhase: 'searching' | 'waiting-removal') => {
        if (!isActive() || requestRef.current || Date.now() < retryAtRef.current) return;
        if (source === 'auto' && Date.now() - lastProbeAtRef.current < AUTO_REQUEST_INTERVAL_MS) return;

        const controller = new AbortController();
        const token = { id: ++requestIdRef.current, generation: generationRef.current, controller, returnPhase, fingerprint, source };
        requestRef.current = token;
        lastProbeFingerprintRef.current = fingerprint;
        lastProbeAtRef.current = Date.now();
        setPhaseIfChanged('checking');

        try {
            const { result } = await detectCurrencyWithGemini(videoRef.current, { signal: controller.signal });
            if (requestRef.current !== token || token.generation !== generationRef.current || !isActive()) return;

            networkFailureCountRef.current = 0;
            networkAnnouncedRef.current = false;
            retryAtRef.current = 0;

            if (result.status === 'detected') {
                if (token.returnPhase === 'waiting-removal') {
                    removalNotFoundCountRef.current = 0;
                    removalConfirmAtRef.current = 0;
                    removalBaselineRef.current = fingerprint;
                    setPhaseIfChanged('waiting-removal');
                    return;
                }

                const captured: CapturedCurrency = { ...result, captureId: Date.now(), source: 'gemini' };
                const entry: CurrencyHistoryItem = { items: captured.items, total: captured.total, signature: captured.signature, id: captured.captureId, timestamp: Date.now() };
                const newTotal = totalRef.current + captured.total;
                totalRef.current = newTotal;
                historyRef.current = [...historyRef.current, entry];
                setResult(captured);
                setTotalAmount(newTotal);
                setScannedHistory(historyRef.current);
                setDetailsOpen(false);
                setHintIfChanged(`รวมยอด ${captured.total} บาทแล้ว`);
                removalBaselineRef.current = fingerprint;
                removalNotFoundCountRef.current = 0;
                removalConfirmAtRef.current = 0;
                feedback?.('success');
                speechManager?.speak('ครั้งนี้ ' + captured.total + ' บาท ยอดรวมสะสม ' + newTotal + ' บาท', { priority: Priority.HIGH, owner: 'currency', rate: 1.1 });
                setPhaseIfChanged('waiting-removal');
                return;
            }

            if (result.status === 'not_found') {
                if (token.returnPhase === 'waiting-removal') {
                    removalNotFoundCountRef.current += 1;
                    if (removalNotFoundCountRef.current >= 2) {
                        finishRemoval();
                    } else {
                        removalConfirmAtRef.current = Date.now() + AUTO_REQUEST_INTERVAL_MS;
                        setPhaseIfChanged('waiting-removal');
                    }
                } else {
                    setPhaseIfChanged('searching');
                }
                return;
            }

            if (result.status === 'blocked') markBlocked();
            if (token.returnPhase === 'waiting-removal') {
                removalNotFoundCountRef.current = 0;
                removalConfirmAtRef.current = 0;
            }
            setPhaseIfChanged(token.returnPhase);
        } catch (error: unknown) {
            if (requestRef.current !== token || token.generation !== generationRef.current || controller.signal.aborted || !isActive()) return;
            const message = error instanceof Error ? error.message : 'Currency scan failed';
            networkFailureCountRef.current += 1;
            const delay = NETWORK_BACKOFF_MS[Math.min(networkFailureCountRef.current - 1, NETWORK_BACKOFF_MS.length - 1)];
            retryAtRef.current = Date.now() + delay;
            addLog?.(`Currency capture error: ${message}`);
            setHintIfChanged('เครือข่ายมีปัญหา ระบบจะลองใหม่อัตโนมัติ');
            if (!networkAnnouncedRef.current) {
                networkAnnouncedRef.current = true;
                speechManager?.speak('เครือข่ายมีปัญหา ระบบจะลองใหม่อัตโนมัติ', { priority: Priority.HIGH, owner: 'currency', rate: 1.1 });
            }
            setPhaseIfChanged(token.returnPhase);
        } finally {
            if (requestRef.current === token) requestRef.current = null;
        }
    }, [addLog, feedback, finishRemoval, isActive, markBlocked, setHintIfChanged, setPhaseIfChanged, setResult, videoRef]);

    const monitorFrame = useCallback((source: RequestSource = 'auto') => {
        if (!isActive() || requestRef.current) return;
        if (!canvasRef.current && typeof document !== 'undefined') canvasRef.current = document.createElement('canvas');
        const analysis = analyzeCurrencyFrame(videoRef.current, canvasRef.current);
        if (analysis.quality === 'blocked') {
            markBlocked();
            return;
        }
        clearBlocked();
        if (analysis.quality !== 'usable' || !analysis.fingerprint) return;

        const now = Date.now();
        const currentPhase = phaseRef.current;
        if (currentPhase === 'waiting-removal') {
            const sceneChanged = hasCurrencySceneChanged(removalBaselineRef.current, analysis.fingerprint);
            const needsConfirmation = removalNotFoundCountRef.current === 1 && now >= removalConfirmAtRef.current;
            if (!sceneChanged && !needsConfirmation) return;
            void requestProbe(source, analysis.fingerprint, 'waiting-removal');
            return;
        }
        if (currentPhase !== 'searching') return;

        const sceneChanged = hasCurrencySceneChanged(lastProbeFingerprintRef.current, analysis.fingerprint);
        const fallbackDue = now - lastProbeAtRef.current >= FALLBACK_PROBE_MS;
        if (source === 'manual' || !lastProbeFingerprintRef.current || sceneChanged || fallbackDue) {
            void requestProbe(source, analysis.fingerprint, 'searching');
        }
    }, [clearBlocked, isActive, markBlocked, requestProbe, videoRef]);

    useEffect(() => {
        const enterCurrentState = () => {
            visibleRef.current = document.visibilityState !== 'hidden';
            if (!enabledRef.current) {
                if (phaseRef.current === 'waiting-removal') resumePhaseRef.current = 'waiting-removal';
                cancelPendingRequest();
                setPhaseIfChanged('idle');
                readyAnnouncedRef.current = false;
                speechManager?.stopByOwner('currency');
                return;
            }
            if (!readyRef.current || !visibleRef.current) {
                if (phaseRef.current === 'waiting-removal') resumePhaseRef.current = 'waiting-removal';
                else if (phaseRef.current !== 'idle' && phaseRef.current !== 'paused') resumePhaseRef.current = 'searching';
                cancelPendingRequest();
                setPhaseIfChanged('paused');
                return;
            }

            const resume = resumePhaseRef.current === 'waiting-removal' ? 'waiting-removal' : 'searching';
            setPhaseIfChanged(resume);
            if (!readyAnnouncedRef.current) {
                readyAnnouncedRef.current = true;
                setHintIfChanged('กำลังค้นหาเงินอัตโนมัติ');
                speechManager?.speak('โหมดดูสกุลเงินพร้อมแล้ว นำธนบัตรเข้ากล้องได้เลย', { priority: Priority.HIGH, owner: 'currency', rate: 1.1 });
            }
        };

        enterCurrentState();
        const handleVisibility = () => enterCurrentState();
        document.addEventListener('visibilitychange', handleVisibility);
        const interval = setInterval(() => monitorFrame(), ANALYSIS_INTERVAL_MS);
        monitorFrame();
        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibility);
            cancelPendingRequest();
        };
    }, [cancelPendingRequest, enabled, isReady, monitorFrame, setHintIfChanged, setPhaseIfChanged]);

    const captureCurrency = useCallback(async () => {
        if (!enabledRef.current || !readyRef.current || !visibleRef.current || requestRef.current || Date.now() < retryAtRef.current) return;
        totalRef.current = 0;
        historyRef.current = [];
        setTotalAmount(0);
        setScannedHistory([]);
        setResult(null);
        setDetailsOpen(false);
        feedback?.('capture');
        monitorFrame('manual');
    }, [feedback, monitorFrame, setResult]);

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
    const clearTotal = useCallback(() => { totalRef.current = 0; historyRef.current = []; setTotalAmount(0); setScannedHistory([]); }, []);

    const scannedCount = scannedHistory.reduce((count, batch) => count + batch.items.reduce((sum, item) => sum + item.quantity, 0), 0);
    const currencyScanning = phase === 'checking';
    const currencyMonitoring = enabled && isReady && phase !== 'idle' && phase !== 'paused';
    return { currencyResult, currencyScanning, currencyMonitoring, currencyHint, currencyBounds: null, totalAmount, scannedHistory, scannedCount, isBlocked, detailsOpen, captureCurrency, showCurrencyDetails, closeCurrencyDetails, replayTotal, clearTotal };
}