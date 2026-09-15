import { useState, useEffect, useRef, useCallback } from 'react';
import { speechController } from '@/shared/accessibility/speechController';
import { mediaSessionManager } from '@/shared/media/mediaSessionManager';

export type SpeechInputState = 'idle' | 'starting' | 'listening' | 'stopping' | 'transcribing';

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

function getSupportedAudioMimeType(): string {
    if (typeof MediaRecorder === 'undefined') return '';
    const candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/ogg',
    ];
    for (const mime of candidates) {
        try {
            if (MediaRecorder.isTypeSupported(mime)) {
                return mime;
            }
        } catch {}
    }
    return '';
}

export function useSpeechInput(
    onResult?: (transcript: string) => void,
    onFeedback?: (type: string) => void,
): UseSpeechInputResult {
    const [state, setState] = useState<SpeechInputState>('idle');
    const stateRef = useRef<SpeechInputState>('idle');
    const [transcript, setTranscript] = useState('');

    const updateState = useCallback((next: SpeechInputState) => {
        stateRef.current = next;
        setState(next);
    }, []);

    const onResultRef = useRef(onResult);
    const onFeedbackRef = useRef(onFeedback);
    useEffect(() => { onResultRef.current = onResult; }, [onResult]);
    useEffect(() => { onFeedbackRef.current = onFeedback; }, [onFeedback]);

    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const sessionActiveRef = useRef(false);
    const cancelledRef = useRef(false);
    const mimeTypeRef = useRef<string>('');

    const isSupported = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined';

    const cancelListening = useCallback(() => {
        if (!sessionActiveRef.current && stateRef.current === 'idle') return;
        cancelledRef.current = true;
        sessionActiveRef.current = false;

        const rec = recorderRef.current;
        recorderRef.current = null;
        if (rec && rec.state !== 'inactive') {
            try {
                rec.stop();
            } catch {}
        }
        chunksRef.current = [];

        void mediaSessionManager.endVoiceCapture();
        speechController.endListening();
        updateState('idle');
        setTranscript('');
    }, [updateState]);

    const stopListening = useCallback(() => {
        if (!sessionActiveRef.current) return;
        sessionActiveRef.current = false;
        updateState('stopping');
        setTranscript('กำลังแปลงเสียง...');

        const rec = recorderRef.current;
        if (rec && rec.state !== 'inactive') {
            try {
                rec.stop();
            } catch {
                cancelListening();
            }
        } else {
            cancelListening();
        }
    }, [cancelListening, updateState]);

    const startListening = useCallback(async () => {
        if (!isSupported) {
            onFeedbackRef.current?.('error');
            speechController.speak('เบราว์เซอร์นี้ไม่รองรับการบันทึกเสียง กรุณาใช้ Chrome หรือ Safari ครับ', {
                channel: 'critical',
            });
            return;
        }

        // Double-tap protection: ignore subsequent clicks if already starting or active
        if (sessionActiveRef.current || stateRef.current !== 'idle') {
            return;
        }

        sessionActiveRef.current = true;
        cancelledRef.current = false;
        chunksRef.current = [];
        updateState('starting');

        // Stop TTS guidance while listening
        speechController.beginListening();

        try {
            const stream = await mediaSessionManager.beginVoiceCapture();

            if (cancelledRef.current || !sessionActiveRef.current) {
                await mediaSessionManager.endVoiceCapture();
                return;
            }

            const mime = getSupportedAudioMimeType();
            mimeTypeRef.current = mime;

            const options: MediaRecorderOptions = {};
            if (mime) {
                options.mimeType = mime;
            }

            const recorder = new MediaRecorder(stream, options);
            recorderRef.current = recorder;

            recorder.ondataavailable = (event: BlobEvent) => {
                if (event.data && event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
            };

            recorder.onerror = (err) => {
                if (process.env.NODE_ENV !== 'production') {
                    console.error('[SpeechInput] MediaRecorder error:', err);
                }
                cancelListening();
            };

            recorder.onstop = async () => {
                const isCancelled = cancelledRef.current;
                const chunks = [...chunksRef.current];
                chunksRef.current = [];
                recorderRef.current = null;

                // Release microphone immediately after recorder stops
                await mediaSessionManager.endVoiceCapture();
                speechController.endListening();

                if (isCancelled || chunks.length === 0) {
                    updateState('idle');
                    return;
                }

                updateState('transcribing');
                try {
                    const mimeType = mimeTypeRef.current || 'audio/webm';
                    const audioBlob = new Blob(chunks, { type: mimeType });

                    const formData = new FormData();
                    formData.append('audio', audioBlob, 'recording');

                    const response = await fetch('/api/transcribe', {
                        method: 'POST',
                        body: formData,
                    });

                    if (!response.ok) {
                        throw new Error(`Transcription API HTTP ${response.status}`);
                    }

                    const data = await response.json();
                    const text = data?.text?.trim();

                    if (text) {
                        setTranscript(`✅ ${text}`);
                        onResultRef.current?.(text);
                    } else {
                        setTranscript('ไม่ได้ยินเสียงพูด');
                        onFeedbackRef.current?.('error');
                    }
                } catch (error) {
                    if (process.env.NODE_ENV !== 'production') {
                        console.error('[SpeechInput] Transcription failed:', error);
                    }
                    setTranscript('แปลงเสียงไม่สำเร็จ');
                    onFeedbackRef.current?.('error');
                } finally {
                    updateState('idle');
                }
            };

            // Timeslice 100ms: emit chunks periodically
            recorder.start(100);
            updateState('listening');
            setTranscript('กำลังฟัง...');
            onFeedbackRef.current?.('mic-start');
        } catch (err) {
            if (process.env.NODE_ENV !== 'production') {
                console.warn('[SpeechInput] Start threw error:', err);
            }
            cancelListening();
            onFeedbackRef.current?.('error');
            speechController.speak('ไม่สามารถเข้าถึงไมโครโฟนได้ กรุณาอนุญาตในการตั้งค่าครับ', {
                channel: 'critical',
            });
        }
    }, [cancelListening, isSupported, updateState]);

    const toggleListening = useCallback(() => {
        if (sessionActiveRef.current || stateRef.current === 'listening' || stateRef.current === 'starting') {
            stopListening();
        } else if (stateRef.current === 'idle') {
            startListening();
        }
    }, [startListening, stopListening]);

    const cancelListeningRef = useRef(cancelListening);
    useEffect(() => {
        cancelListeningRef.current = cancelListening;
    }, [cancelListening]);

    // Cleanup strictly on unmount
    useEffect(() => {
        return () => {
            cancelListeningRef.current();
        };
    }, []);

    return {
        isListening: state === 'starting' || state === 'listening' || state === 'stopping' || state === 'transcribing',
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
