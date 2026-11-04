import { useState, useRef, useCallback, useEffect, RefObject } from 'react';
import { analyzeCurrencyFrame, detectCurrencyWithGemini, hasCurrencySceneChanged } from '@/features/blind-assistant/client/currencyGemini';
import { CurrencyBatch } from '@/features/blind-assistant/client/currencyUtils';
import { describeGeminiError, GeminiRequestError } from '@/features/blind-assistant/client/geminiVision';
import { speechController } from '@/shared/accessibility/speechController';
import { BoundingBox } from '@/features/blind-assistant/types/assistant';
import { EarconType } from '@/shared/accessibility/audio';

export interface CapturedCurrency extends CurrencyBatch { captureId: number; source: 'gemini'; }
export interface CurrencyHistoryItem extends CurrencyBatch { id: number; timestamp: number; }
export interface UseCurrencyScannerResult {
    currencyResult: CapturedCurrency | null; currencyScanning: boolean; currencyMonitoring: boolean;
    currencyHint: string; captureMessage: string; captureNoticeId: number; currencyBounds: BoundingBox | null; totalAmount: number; scannedHistory: CurrencyHistoryItem[];
    scannedCount: number; isBlocked: boolean;
    captureCurrency: () => Promise<void>;
    replayCurrencyDetails: () => void;
    clearTotal: () => void;
}

type CurrencyScanPhase = 'idle' | 'searching' | 'checking' | 'waiting-removal' | 'paused';
type RequestSource = 'auto' | 'manual';

const ANALYSIS_INTERVAL_MS = 160;
const FALLBACK_PROBE_MS = 8000;
const AUTO_REQUEST_INTERVAL_MS = 1500;
// The scene must hold still this many analysis frames (~160 ms each) before an automatic probe,
// so a hand still moving the note into view does not waste a request on a blurry frame.
const SETTLED_FRAMES_REQUIRED = 2;
const STABLE_FRAME_THRESHOLD = 6;
const BLOCKED_ANNOUNCEMENT_MS = 2000;
const NETWORK_BACKOFF_MS = [1500, 3000, 6000, 12000, 20000];

// A daily quota does not come back in seconds; do not hammer the API every few seconds.
const QUOTA_BACKOFF_MS = 5 * 60 * 1000;

function autoRetryMessage(error: unknown): string {
    if (error instanceof GeminiRequestError && error.kind === 'quota') return 'โควตา AI ของวันนี้เต็มแล้ว ระบบจะลองใหม่ภายหลัง';
    const offline = (error instanceof GeminiRequestError && error.kind === 'offline')
        || (typeof navigator !== 'undefined' && navigator.onLine === false);
    return offline ? 'ไม่มีอินเทอร์เน็ต ระบบจะลองใหม่อัตโนมัติ' : 'ระบบ AI ยุ่งอยู่ ระบบจะลองใหม่อัตโนมัติ';
}

export function useCurrencyScanner(
    videoRef: RefObject<HTMLVideoElement | null>,
    enabled: boolean,
    isReady: boolean,
    audioReady: boolean,
    feedback?: (type: EarconType) => void,
    addLog?: (msg: string) => void,
    cameraContainerRef?: RefObject<HTMLElement | null>
): UseCurrencyScannerResult {
    const [currencyResult, setCurrencyResult] = useState<CapturedCurrency | null>(null);
    const [phase, setPhase] = useState<CurrencyScanPhase>('idle');
    const [currencyHint, setCurrencyHint] = useState('');
    const [captureMessage, setCaptureMessageText] = useState('');
    // Bumped on every notice so an identical message (the same failure twice) is announced again.
    const [captureNoticeId, setCaptureNoticeId] = useState(0);
    const setCaptureMessage = useCallback((text: string) => {
        setCaptureMessageText(text);
        if (text) setCaptureNoticeId((id) => id + 1);
    }, []);
    const [totalAmount, setTotalAmount] = useState(0);
    const [scannedHistory, setScannedHistory] = useState<CurrencyHistoryItem[]>([]);
    const [isBlocked, setIsBlocked] = useState(false);

    const enabledRef = useRef(enabled);
    const readyRef = useRef(isReady);
    const audioReadyRef = useRef(audioReady);
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
    const previousFrameFingerprintRef = useRef<Uint8Array | null>(null);
    const stableFrameCountRef = useRef(0);
    const lastProbeAtRef = useRef(0);
    const removalBaselineRef = useRef<Uint8Array | null>(null);
    const removalNotFoundCountRef = useRef(0);
    const removalConfirmAtRef = useRef(0);
    const retryAtRef = useRef(0);
    const networkFailureCountRef = useRef(0);
    const networkAnnouncedRef = useRef(false);

    enabledRef.current = enabled;
    readyRef.current = isReady;
    audioReadyRef.current = audioReady;

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
    const isActive = useCallback(() => enabledRef.current && readyRef.current && visibleRef.current && !speechController.isOrientationBlocked, []);

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
            speechController.speak('กล้องโดนบัง กรุณาเปิดหน้ากล้อง', { channel: 'critical', dedupeMs: BLOCKED_ANNOUNCEMENT_MS });
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
        setHintIfChanged('พร้อมสแกนใบถัดไป');
        setPhaseIfChanged('searching');
        speechController.speak('พร้อมสแกนใบถัดไป', { channel: 'realtime', key: 'currency-ready', dedupeMs: 2000 });
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
            const { result } = await detectCurrencyWithGemini(videoRef.current, {
                signal: controller.signal,
                container: cameraContainerRef?.current,
            });
            if (requestRef.current !== token || token.generation !== generationRef.current || !isActive()) return;

            networkFailureCountRef.current = 0;
            networkAnnouncedRef.current = false;
            retryAtRef.current = 0;

            if (result.status === 'detected') {
                // The same note still in view keeps us waiting; a different one is a new result, so notes can be swapped back to back.
                if (token.returnPhase === 'waiting-removal' && result.signature === resultRef.current?.signature) {
                    removalNotFoundCountRef.current = 0;
                    removalConfirmAtRef.current = 0;
                    removalBaselineRef.current = fingerprint;
                    setPhaseIfChanged('waiting-removal');
                    return;
                }

                const captured: CapturedCurrency = { ...result, captureId: Date.now(), source: 'gemini' };
                const entry: CurrencyHistoryItem = { items: captured.items, total: captured.total, signature: captured.signature, id: captured.captureId, timestamp: Date.now() };
                const newTotal = captured.total;
                totalRef.current = newTotal;
                historyRef.current = [entry];
                setResult(captured);
                setTotalAmount(newTotal);
                setScannedHistory(historyRef.current);
                setCaptureMessage('');
                setHintIfChanged(`ตรวจพบ ${captured.total} บาท`);
                removalBaselineRef.current = fingerprint;
                removalNotFoundCountRef.current = 0;
                removalConfirmAtRef.current = 0;
                feedback?.('success');
                // Result is announced from the semantic DOM (status region in CameraView), not TTS.
                setPhaseIfChanged('waiting-removal');
                return;
            }

            if (source === 'manual') {
                // A user-initiated capture must always report why it produced no result.
                setCaptureMessage(result.status === 'blocked'
                    ? 'กล้องโดนบัง กรุณาเปิดหน้ากล้องแล้วกดถ่ายเองอีกครั้ง'
                    : 'ไม่พบธนบัตรหรือเหรียญ ลองวางให้อยู่กลางกล้องแล้วกดถ่ายเองอีกครั้ง');
                feedback?.('error');
                setPhaseIfChanged('searching');
                return;
            }

            if (result.status === 'not_found') {
                if (token.returnPhase === 'waiting-removal') {
                    // The scene changed and no currency is left, so the note was removed.
                    finishRemoval();
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
            const quotaExhausted = error instanceof GeminiRequestError && error.kind === 'quota';
            const delay = quotaExhausted
                ? QUOTA_BACKOFF_MS
                : NETWORK_BACKOFF_MS[Math.min(networkFailureCountRef.current - 1, NETWORK_BACKOFF_MS.length - 1)];
            retryAtRef.current = Date.now() + delay;
            addLog?.(`Currency capture error: ${message}`);
            if (source === 'manual') {
                retryAtRef.current = 0;
                networkFailureCountRef.current = 0;
                setCaptureMessage(describeGeminiError(error));
                feedback?.('error');
                setPhaseIfChanged('searching');
                return;
            }
            const retryMessage = autoRetryMessage(error);
            setHintIfChanged(retryMessage);
            if (!networkAnnouncedRef.current) {
                networkAnnouncedRef.current = true;
                speechController.speak(retryMessage, { channel: 'critical', dedupeMs: delay });
            }
            setPhaseIfChanged(token.returnPhase);
        } finally {
            if (requestRef.current === token) requestRef.current = null;
        }
    }, [addLog, cameraContainerRef, feedback, finishRemoval, isActive, markBlocked, setCaptureMessage, setHintIfChanged, setPhaseIfChanged, setResult, videoRef]);

    const monitorFrame = useCallback((source: RequestSource = 'auto') => {
        if (!isActive() || requestRef.current) return;
        if (!canvasRef.current && typeof document !== 'undefined') canvasRef.current = document.createElement('canvas');
        const analysis = analyzeCurrencyFrame(videoRef.current, canvasRef.current, cameraContainerRef?.current);
        if (analysis.quality === 'blocked') {
            markBlocked();
            return;
        }
        clearBlocked();
        if (analysis.quality !== 'usable' || !analysis.fingerprint) return;

        // Track how long the scene has held still; automatic probes wait for it to settle.
        stableFrameCountRef.current = hasCurrencySceneChanged(previousFrameFingerprintRef.current, analysis.fingerprint, STABLE_FRAME_THRESHOLD)
            ? 0
            : stableFrameCountRef.current + 1;
        previousFrameFingerprintRef.current = analysis.fingerprint;
        const settled = source === 'manual' || stableFrameCountRef.current >= SETTLED_FRAMES_REQUIRED;

        const now = Date.now();
        const currentPhase = phaseRef.current;
        if (currentPhase === 'waiting-removal') {
            const sceneChanged = hasCurrencySceneChanged(removalBaselineRef.current, analysis.fingerprint);
            const needsConfirmation = removalNotFoundCountRef.current === 1 && now >= removalConfirmAtRef.current;
            if ((!sceneChanged && !needsConfirmation) || !settled) return;
            void requestProbe(source, analysis.fingerprint, 'waiting-removal');
            return;
        }
        if (currentPhase !== 'searching') return;

        const sceneChanged = hasCurrencySceneChanged(lastProbeFingerprintRef.current, analysis.fingerprint);
        const fallbackDue = now - lastProbeAtRef.current >= FALLBACK_PROBE_MS;
        if (source === 'manual' || (settled && (!lastProbeFingerprintRef.current || sceneChanged || fallbackDue))) {
            void requestProbe(source, analysis.fingerprint, 'searching');
        }
    }, [cameraContainerRef, clearBlocked, isActive, markBlocked, requestProbe, videoRef]);

    useEffect(() => {
        const enterCurrentState = () => {
            visibleRef.current = document.visibilityState !== 'hidden';
            if (!enabledRef.current) {
                if (phaseRef.current === 'waiting-removal') resumePhaseRef.current = 'waiting-removal';
                cancelPendingRequest();
                setPhaseIfChanged('idle');
                readyAnnouncedRef.current = false;
                speechController.stop();
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
        if (!enabledRef.current || !readyRef.current || !visibleRef.current) {
            feedback?.('error');
            return;
        }

        // User-initiated: override the auto-scan backoff, any in-flight auto probe and removal gating.
        cancelPendingRequest();
        retryAtRef.current = 0;
        networkFailureCountRef.current = 0;
        networkAnnouncedRef.current = false;
        removalBaselineRef.current = null;
        removalNotFoundCountRef.current = 0;
        removalConfirmAtRef.current = 0;
        totalRef.current = 0;
        historyRef.current = [];
        setTotalAmount(0);
        setScannedHistory([]);
        setResult(null);
        setCaptureMessage('');
        feedback?.('capture');

        if (!canvasRef.current && typeof document !== 'undefined') canvasRef.current = document.createElement('canvas');
        const analysis = analyzeCurrencyFrame(videoRef.current, canvasRef.current, cameraContainerRef?.current);
        setPhaseIfChanged('searching');
        if (analysis.quality === 'blocked') {
            setBlockedIfChanged(true);
            setCaptureMessage('กล้องโดนบัง กรุณาเปิดหน้ากล้องแล้วกดถ่ายเองอีกครั้ง');
            feedback?.('error');
            return;
        }
        if (analysis.quality === 'invalid' || !analysis.fingerprint) {
            setCaptureMessage('กล้องยังไม่พร้อม กรุณารอสักครู่แล้วกดถ่ายเองอีกครั้ง');
            feedback?.('error');
            return;
        }
        clearBlocked();
        await requestProbe('manual', analysis.fingerprint, 'searching');
    }, [cameraContainerRef, cancelPendingRequest, clearBlocked, feedback, requestProbe, setBlockedIfChanged, setCaptureMessage, setPhaseIfChanged, setResult, videoRef]);

    const replayCurrencyDetails = useCallback(() => {
        if (!resultRef.current) return;
        feedback?.('capture');
    }, [feedback]);
    const clearTotal = useCallback(() => {
        totalRef.current = 0;
        historyRef.current = [];
        setTotalAmount(0);
        setScannedHistory([]);
        setResult(null);
        setCaptureMessage('');
        // Back to searching with a clean slate: otherwise the stale "detected X baht" hint stays and the same note
        // is ignored until it moves.
        removalBaselineRef.current = null;
        removalNotFoundCountRef.current = 0;
        removalConfirmAtRef.current = 0;
        lastProbeFingerprintRef.current = null;
        if (phaseRef.current === 'waiting-removal') setPhaseIfChanged('searching');
        setHintIfChanged('กำลังค้นหาเงินอัตโนมัติ');
    }, [setCaptureMessage, setHintIfChanged, setPhaseIfChanged, setResult]);

    const scannedCount = scannedHistory.reduce((count, batch) => count + batch.items.reduce((sum, item) => sum + item.quantity, 0), 0);
    const currencyScanning = phase === 'checking';
    const currencyMonitoring = enabled && isReady && phase !== 'idle' && phase !== 'paused';
    return { currencyResult, currencyScanning, currencyMonitoring, currencyHint, captureMessage, captureNoticeId, currencyBounds: null, totalAmount, scannedHistory, scannedCount, isBlocked, captureCurrency, replayCurrencyDetails, clearTotal };
}
