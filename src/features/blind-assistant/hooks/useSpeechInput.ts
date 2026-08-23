import { useState, useEffect, useRef, useCallback } from 'react';
import speechManager, { Priority } from '@/shared/accessibility/speechManager';

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

export function useSpeechInput(
    onResult?: (transcript: string) => void,
    onFeedback?: (type: string) => void,
): UseSpeechInputResult {
    const [state, setState] = useState<SpeechInputState>('idle');
    const [transcript, setTranscript] = useState('');
    const [isSupported, setIsSupported] = useState(false);
    const recognitionRef = useRef<any>(null);
    const onResultRef = useRef(onResult);
    const onFeedbackRef = useRef(onFeedback);
    const finalTranscriptRef = useRef('');
    const submitOnEndRef = useRef(false);
    const sessionActiveRef = useRef(false);

    useEffect(() => { onResultRef.current = onResult; }, [onResult]);
    useEffect(() => { onFeedbackRef.current = onFeedback; }, [onFeedback]);

    const finishSession = useCallback(() => {
        if (!sessionActiveRef.current) return;
        sessionActiveRef.current = false;
        speechManager?.endListeningSession();
        setState('idle');
        const finalTranscript = finalTranscriptRef.current.trim();
        const shouldSubmit = submitOnEndRef.current;
        submitOnEndRef.current = false;
        if (shouldSubmit && finalTranscript) onResultRef.current?.(finalTranscript);
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'th-TH';
        recognitionRef.current = recognition;
        setIsSupported(true);

        recognition.onstart = () => {
            setState('listening');
            setTranscript('กำลังฟัง...');
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
            if (interim) setTranscript(`🎤 ${interim}`);
            if (final.trim()) {
                finalTranscriptRef.current = `${finalTranscriptRef.current} ${final}`.trim();
                setTranscript(`✅ ${finalTranscriptRef.current}`);
            }
        };
        recognition.onerror = (event: any) => {
            submitOnEndRef.current = false;
            if (event.error === 'aborted') setTranscript('ยกเลิกการถามด้วยเสียง');
            else if (event.error === 'no-speech') setTranscript('ไม่ได้ยินเสียง');
            else {
                setTranscript('ไม่สามารถใช้ไมโครโฟนได้');
                onFeedbackRef.current?.('error');
            }
        };
        recognition.onend = () => finishSession();

        return () => {
            submitOnEndRef.current = false;
            try { recognition.abort(); } catch {}
            finishSession();
            if (recognitionRef.current === recognition) recognitionRef.current = null;
        };
    }, [finishSession]);

    const startListening = useCallback(() => {
        const recognition = recognitionRef.current;
        if (!recognition) {
            onFeedbackRef.current?.('error');
            speechManager?.speak('เบราว์เซอร์นี้ไม่รองรับการสั่งงานด้วยเสียง', {
                priority: Priority.CRITICAL,
                owner: 'speech-input',
                dedupe: true,
            });
            return;
        }
        if (sessionActiveRef.current || state !== 'idle') return;
        const accepted = speechManager?.beginListeningSession({
            abortRecognition: () => {
                submitOnEndRef.current = false;
                try { recognition.abort(); } catch {}
            },
        }) ?? false;
        if (!accepted) return;

        finalTranscriptRef.current = '';
        submitOnEndRef.current = true;
        sessionActiveRef.current = true;
        setState('starting');
        try {
            recognition.start();
        } catch {
            submitOnEndRef.current = false;
            finishSession();
        }
    }, [finishSession, state]);

    const stopListening = useCallback(() => {
        const recognition = recognitionRef.current;
        if (!recognition || !sessionActiveRef.current) return;
        setState('stopping');
        try { recognition.stop(); } catch { finishSession(); }
    }, [finishSession]);

    const cancelListening = useCallback(() => {
        const recognition = recognitionRef.current;
        submitOnEndRef.current = false;
        if (!sessionActiveRef.current) return;
        try { recognition?.abort(); } catch { finishSession(); }
    }, [finishSession]);

    const toggleListening = useCallback(() => {
        if (sessionActiveRef.current) stopListening();
        else startListening();
    }, [startListening, stopListening]);

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
