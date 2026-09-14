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

    useEffect(() => { onResultRef.current = onResult; }, [onResult]);
    useEffect(() => { onFeedbackRef.current = onFeedback; }, [onFeedback]);

    const finishSession = useCallback((reason = 'default', options?: { abort?: boolean }) => {
        if (!sessionActiveRef.current) return;
        sessionActiveRef.current = false;
        isExplicitStopRef.current = false;

        if (process.env.NODE_ENV !== 'production') {
            console.log(`[SpeechInput] finishSession (${reason})`);
        }

        const rec = recognitionRef.current;
        recognitionRef.current = null;

        if (rec) {
            rec.onstart = null;
            rec.onresult = null;
            rec.onerror = null;
            rec.onend = null;
            if (options?.abort) {
                try {
                    if (process.env.NODE_ENV !== 'production') {
                        console.log('[SpeechInput] abort');
                    }
                    rec.abort?.();
                } catch {}
            }
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

        if (shouldSubmit && finalTranscript) {
            onResultRef.current?.(finalTranscript);
        }
    }, []);

    const createRecognition = useCallback(() => {
        if (typeof window === 'undefined') return null;
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) return null;

        if (process.env.NODE_ENV !== 'production') {
            console.log('[SpeechInput] create');
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'th-TH';

        recognition.onstart = () => {
            if (process.env.NODE_ENV !== 'production') {
                console.log('[SpeechInput] onstart');
            }
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
                if (result.isFinal) {
                    final += result[0]?.transcript || '';
                } else {
                    interim += result[0]?.transcript || '';
                }
            }

            if (interim) {
                interimTranscriptRef.current = interim;
                setTranscript(`🎤 ${interim}`);
                if (process.env.NODE_ENV !== 'production') {
                    console.log('[SpeechInput] onresult interim:', interim);
                }
            }

            if (final.trim()) {
                finalTranscriptRef.current = `${finalTranscriptRef.current} ${final}`.trim();
                setTranscript(`✅ ${finalTranscriptRef.current}`);
                interimTranscriptRef.current = '';
                if (process.env.NODE_ENV !== 'production') {
                    console.log('[SpeechInput] onresult final:', finalTranscriptRef.current);
                }

                // Final result marks for submission and triggers orderly stop (Requirement 2)
                submitOnEndRef.current = true;
                try {
                    if (process.env.NODE_ENV !== 'production') {
                        console.log('[SpeechInput] stop (orderly after final result)');
                    }
                    recognition.stop?.();
                } catch (err) {
                    if (process.env.NODE_ENV !== 'production') {
                        console.warn('[SpeechInput] recognition.stop() threw:', err);
                    }
                }
            }
        };

        recognition.onerror = (event: any) => {
            if (process.env.NODE_ENV !== 'production') {
                console.log('[SpeechInput] onerror:', event?.error);
            }
            if (!sessionActiveRef.current) return;

            if (event?.error === 'no-speech') {
                // no-speech: do not restart, finish session, user can press mic again (Requirement 5)
                setTranscript(finalTranscriptRef.current ? `✅ ${finalTranscriptRef.current}` : 'ไม่ได้ยินเสียงพูด');
                submitOnEndRef.current = Boolean(finalTranscriptRef.current.trim());
            } else if (event?.error === 'aborted') {
                // aborted: cleanup and end, do not restart (Requirement 5)
                setTranscript('ยกเลิกการถามด้วยเสียง');
                submitOnEndRef.current = false;
            } else if (event?.error === 'not-allowed') {
                // not-allowed: end session, show/speak error (Requirement 5)
                submitOnEndRef.current = false;
                setTranscript('ไม่ได้รับอนุญาตให้ใช้ไมโครโฟน');
                onFeedbackRef.current?.('error');
                speechController.speak('ไม่สามารถเข้าถึงไมโครโฟนได้ กรุณาอนุญาตในการตั้งค่าครับ', {
                    channel: 'critical',
                });
            } else {
                submitOnEndRef.current = false;
                setTranscript('ไม่สามารถใช้ไมโครโฟนได้');
                onFeedbackRef.current?.('error');
            }
        };

        recognition.onend = () => {
            if (process.env.NODE_ENV !== 'production') {
                console.log('[SpeechInput] onend');
            }
            // One user action = one SpeechRecognition session. Never restart in onend (Requirement 1 & 2).
            finishSession('onend');
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

        // Clean up any lingering session before starting a new one (Requirement 4)
        if (sessionActiveRef.current || state !== 'idle') {
            finishSession('cleanup dangling session before start', { abort: true });
        }

        if (process.env.NODE_ENV !== 'production') {
            console.log('[SpeechInput] startListening invoked');
        }

        // Stop / suppress TTS guidance intentionally once (Requirement 4 & 8)
        speechController.beginListening();

        finalTranscriptRef.current = '';
        interimTranscriptRef.current = '';
        submitOnEndRef.current = false;
        sessionActiveRef.current = true;
        setState('starting');

        const recognition = createRecognition();
        recognitionRef.current = recognition;

        if (!recognition) {
            finishSession('createRecognition returned null');
            return;
        }

        try {
            if (process.env.NODE_ENV !== 'production') {
                console.log('[SpeechInput] start');
            }
            recognition.start();
        } catch (err) {
            if (process.env.NODE_ENV !== 'production') {
                console.warn('[SpeechInput] start threw error:', err);
            }
            finishSession('start threw error', { abort: true });
        }
    }, [createRecognition, finishSession, state]);

    const stopListening = useCallback(() => {
        if (!sessionActiveRef.current) return;
        if (process.env.NODE_ENV !== 'production') {
            console.log('[SpeechInput] stopListening requested');
        }
        setState('stopping');
        submitOnEndRef.current = true;

        const rec = recognitionRef.current;
        if (rec) {
            try {
                if (process.env.NODE_ENV !== 'production') {
                    console.log('[SpeechInput] stop');
                }
                rec.stop?.();
            } catch {
                finishSession('stopListening fallback', { abort: true });
            }
        } else {
            finishSession('stopListening without active rec');
        }
    }, [finishSession]);

    const cancelListening = useCallback(() => {
        if (process.env.NODE_ENV !== 'production') {
            console.log('[SpeechInput] cancelListening requested');
        }
        submitOnEndRef.current = false;
        interimTranscriptRef.current = '';
        finalTranscriptRef.current = '';
        if (!sessionActiveRef.current) return;
        finishSession('cancelListening', { abort: true });
    }, [finishSession]);

    const toggleListening = useCallback(() => {
        if (sessionActiveRef.current) {
            stopListening();
        } else {
            startListening();
        }
    }, [startListening, stopListening]);

    useEffect(() => {
        return () => {
            submitOnEndRef.current = false;
            finishSession('unmount', { abort: true });
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
