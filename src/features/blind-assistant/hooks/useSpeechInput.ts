import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import { speechController } from '@/shared/accessibility/speechController';

export type SpeechInputState = 'idle' | 'starting' | 'listening' | 'stopping';

export interface UseSpeechInputResult {
    isListening: boolean;
    state: SpeechInputState;
    isSupported: boolean;
    transcript: string;
    toggleListening: () => void;
    startListening: () => void;
    stopListening: () => void;
    cancelListening: () => void;
    setTranscript: React.Dispatch<React.SetStateAction<string>>;
}

const subscribeToSpeechRecognitionSupport = () => () => {};

const getSpeechRecognitionSupport = () => (
    typeof window !== 'undefined'
    && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
);

const getServerSpeechRecognitionSupport = () => false;

export function useSpeechInput(
    onResult?: (transcript: string) => void,
    onFeedback?: (type: string) => void,
): UseSpeechInputResult {
    const [state, setState] = useState<SpeechInputState>('idle');
    const [transcript, setTranscript] = useState('');
    const isSupported = useSyncExternalStore(
        subscribeToSpeechRecognitionSupport,
        getSpeechRecognitionSupport,
        getServerSpeechRecognitionSupport,
    );
    const recognitionRef = useRef<any>(null);
    const onResultRef = useRef(onResult);
    const onFeedbackRef = useRef(onFeedback);
    const finalTranscriptRef = useRef('');
    const interimTranscriptRef = useRef('');
    const submitOnEndRef = useRef(false);
    const isExplicitStopRef = useRef(false);
    const sessionActiveRef = useRef(false);
    const fallbackTimerRef = useRef<any>(null);

    useEffect(() => { onResultRef.current = onResult; }, [onResult]);
    useEffect(() => { onFeedbackRef.current = onFeedback; }, [onFeedback]);

    const finishSession = useCallback(() => {
        if (!sessionActiveRef.current) return;
        sessionActiveRef.current = false;
        isExplicitStopRef.current = false;
        if (fallbackTimerRef.current) {
            clearTimeout(fallbackTimerRef.current);
            fallbackTimerRef.current = null;
        }
        speechController.endListening();
        setState('idle');

        const finalTranscript = [finalTranscriptRef.current.trim(), interimTranscriptRef.current.trim()]
            .filter(Boolean)
            .join(' ')
            .trim();
        const shouldSubmit = submitOnEndRef.current;
        submitOnEndRef.current = false;
        interimTranscriptRef.current = '';

        const rec = recognitionRef.current;
        if (rec) {
            try {
                rec.onstart = null;
                rec.onresult = null;
                rec.onerror = null;
                rec.onend = null;
                rec.abort();
            } catch {}
            recognitionRef.current = null;
        }

        if (shouldSubmit) onResultRef.current?.(finalTranscript);
    }, []);

    const createRecognition = useCallback(() => {
        if (typeof window === 'undefined') return null;
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) return null;

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'th-TH';

        recognition.onstart = () => {
            setState('listening');
            setTranscript('กำลังฟัง...');
            interimTranscriptRef.current = '';
            onFeedbackRef.current?.('mic-start');
        };

        recognition.onresult = (event: any) => {
            let interim = '';
            let final = '';
            for (let index = event.resultIndex || 0; index < event.results.length; index += 1) {
                const result = event.results[index];
                if (result.isFinal) final += result[0]?.transcript || '';
                else interim += result[0]?.transcript || '';
            }
            if (interim) {
                interimTranscriptRef.current = interim;
                setTranscript(`🎤 ${interim}`);
            }
            if (final.trim()) {
                finalTranscriptRef.current = `${finalTranscriptRef.current} ${final}`.trim();
                setTranscript(`✅ ${finalTranscriptRef.current}`);
                interimTranscriptRef.current = '';
            }
        };

        recognition.onerror = (event: any) => {
            if (isExplicitStopRef.current) {
                return;
            }
            if (event.error === 'no-speech') {
                setTranscript(finalTranscriptRef.current ? `✅ ${finalTranscriptRef.current}` : 'กำลังฟัง...');
                return;
            }
            if (event.error === 'aborted') {
                setTranscript('ยกเลิกการถามด้วยเสียง');
                return;
            }
            submitOnEndRef.current = false;
            interimTranscriptRef.current = '';
            setTranscript('ไม่สามารถใช้ไมโครโฟนได้');
            onFeedbackRef.current?.('error');
        };

        recognition.onend = () => {
            if (isExplicitStopRef.current) {
                finishSession();
                return;
            }
            if (sessionActiveRef.current) {
                try {
                    recognition.start();
                } catch {
                    setTimeout(() => {
                        if (sessionActiveRef.current && !isExplicitStopRef.current) {
                            try { recognition.start(); } catch {}
                        }
                    }, 200);
                }
                return;
            }
            finishSession();
        };

        return recognition;
    }, [finishSession]);

    const startListening = useCallback(() => {
        const SpeechRecognition = typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
        if (!SpeechRecognition) {
            onFeedbackRef.current?.('error');
            speechController.speak('เบราว์เซอร์นี้ไม่รองรับไมค์ กรุณาใช้ Chrome หรือ Safari ครับ', {
                channel: 'critical',
            });
            return;
        }

        if (sessionActiveRef.current || state !== 'idle') {
            try { recognitionRef.current?.abort(); } catch {}
            recognitionRef.current = null;
        }

        speechController.beginListening();

        finalTranscriptRef.current = '';
        interimTranscriptRef.current = '';
        submitOnEndRef.current = false;
        isExplicitStopRef.current = false;
        sessionActiveRef.current = true;
        setState('starting');

        const recognition = createRecognition();
        recognitionRef.current = recognition;

        if (!recognition) {
            finishSession();
            return;
        }

        try {
            recognition.start();
        } catch {
            submitOnEndRef.current = false;
            isExplicitStopRef.current = false;
            interimTranscriptRef.current = '';
            finishSession();
        }
    }, [createRecognition, finishSession, state]);

    const stopListening = useCallback(() => {
        if (!sessionActiveRef.current) return;
        setState('stopping');
        isExplicitStopRef.current = true;
        submitOnEndRef.current = true;

        const recognition = recognitionRef.current;
        if (!recognition) {
            finishSession();
            return;
        }

        if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = setTimeout(() => {
            finishSession();
        }, 250);

        try {
            recognition.stop();
        } catch {
            finishSession();
        }
    }, [finishSession]);

    const cancelListening = useCallback(() => {
        submitOnEndRef.current = false;
        isExplicitStopRef.current = false;
        interimTranscriptRef.current = '';
        finalTranscriptRef.current = '';
        if (fallbackTimerRef.current) {
            clearTimeout(fallbackTimerRef.current);
            fallbackTimerRef.current = null;
        }
        if (!sessionActiveRef.current) return;
        const recognition = recognitionRef.current;
        try { recognition?.abort(); } catch {}
        finishSession();
    }, [finishSession]);

    const toggleListening = useCallback(() => {
        if (sessionActiveRef.current) stopListening();
        else startListening();
    }, [startListening, stopListening]);

    useEffect(() => {
        return () => {
            if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
            submitOnEndRef.current = false;
            isExplicitStopRef.current = false;
            interimTranscriptRef.current = '';
            try { recognitionRef.current?.abort(); } catch {}
            finishSession();
        };
    }, [finishSession]);

    return {
        isListening: state === 'starting' || state === 'listening' || state === 'stopping',
        state,
        isSupported,
        transcript,
        toggleListening,
        startListening,
        stopListening,
        cancelListening,
        setTranscript,
    };
}
