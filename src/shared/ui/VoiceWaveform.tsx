'use client';

import { useEffect, useRef } from 'react';

export interface VoiceWaveformProps {
    active: boolean;
    color?: string;
    className?: string;
}

declare global {
    interface Window {
        webkitAudioContext?: typeof AudioContext;
    }
}

const FFT_SIZE = 256;
const MIC_BINS = [[1, 4], [4, 11], [11, 33]] as const;
const MIC_GAIN = 2.2;
const ATTACK_MS = 40;
const RELEASE_MS = 240;
const QUIET_HEIGHT = 0.1;
const MAX_DELTA_SECONDS = 0.05;
const WAVE_EVERY_FRAMES = 4;
const WAVE_HISTORY_MAX = 80;

function sizeCanvas(canvas: HTMLCanvasElement) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const bounds = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width * dpr));
    const height = Math.max(1, Math.round(bounds.height * dpr));

    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }

    return { width, height, dpr };
}

function drawQuietWave(canvas: HTMLCanvasElement, color: string) {
    const context = canvas.getContext('2d');
    if (!context) return;

    const { width, height, dpr } = sizeCanvas(canvas);
    const barWidth = 2 * dpr;
    const step = 5 * dpr;
    const barHeight = Math.max(barWidth, height * QUIET_HEIGHT);
    const startX = Math.max(0, Math.round((width - step * 7) / 2));

    context.clearRect(0, 0, width, height);
    context.fillStyle = color;
    context.globalAlpha = 0.55;
    for (let index = 0; index < 7; index += 1) {
        const x = startX + index * step;
        context.fillRect(x, (height - barHeight) / 2, barWidth, barHeight);
    }
    context.globalAlpha = 1;
}

function drawWave(
    canvas: HTMLCanvasElement,
    history: number[],
    level: number,
    color: string,
    tick: number,
    accumulator: number,
) {
    const context = canvas.getContext('2d');
    if (!context) return { accumulator, tick };

    const { width, height, dpr } = sizeCanvas(canvas);
    const nextAccumulator = Math.max(accumulator, level);
    const nextTick = (tick + 1) % WAVE_EVERY_FRAMES;
    let sampledAccumulator = nextAccumulator;

    if (nextTick === 0) {
        history.push(nextAccumulator);
        if (history.length > WAVE_HISTORY_MAX) history.shift();
        sampledAccumulator = 0;
    }

    const barWidth = 2 * dpr;
    const step = 3 * dpr;
    const shift = (nextTick / WAVE_EVERY_FRAMES) * step;
    context.clearRect(0, 0, width, height);
    context.fillStyle = color;

    for (let index = 0; index < history.length; index += 1) {
        const value = history[history.length - 1 - index];
        const x = width - (index + 1) * step - shift;
        if (x + barWidth < 0) break;

        const barHeight = Math.max(barWidth, (QUIET_HEIGHT + (1 - QUIET_HEIGHT) * value) * height);
        const fadePosition = Math.min(1, Math.max(0, (x + barWidth / 2) / (width * 0.55)));
        const fade = fadePosition * fadePosition * (3 - 2 * fadePosition);
        context.globalAlpha = (0.35 + 0.65 * value) * fade;
        context.fillRect(x, (height - barHeight) / 2, barWidth, barHeight);
    }

    context.globalAlpha = 1;
    return { accumulator: sampledAccumulator, tick: nextTick };
}

function getMicLevel(analyser: AnalyserNode, buffer: Uint8Array<ArrayBuffer>) {
    analyser.getByteFrequencyData(buffer);
    let total = 0;

    for (const [low, high] of MIC_BINS) {
        let binTotal = 0;
        for (let index = low; index < high; index += 1) binTotal += buffer[index];
        total += binTotal / ((high - low) * 255);
    }

    return (total / MIC_BINS.length) * MIC_GAIN;
}

export default function VoiceWaveform({ active, color = '#FF453A', className = '' }: VoiceWaveformProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !active) return;

        let disposed = false;
        let attemptId = 0;
        let opening = false;
        let animationFrame = 0;
        let stream: MediaStream | null = null;
        let source: MediaStreamAudioSourceNode | null = null;
        let audioContext: AudioContext | null = null;
        let analyser: AnalyserNode | null = null;
        let buffer: Uint8Array<ArrayBuffer> | null = null;
        let envelope = 0;
        let lastFrameAt = performance.now();
        let lastDrawAt = 0;
        let tick = 0;
        let accumulator = 0;
        const history: number[] = [];
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

        const releaseAudio = () => {
            if (animationFrame) cancelAnimationFrame(animationFrame);
            animationFrame = 0;
            source?.disconnect();
            source = null;
            stream?.getTracks().forEach(track => track.stop());
            stream = null;
            analyser = null;
            buffer = null;
            if (audioContext && audioContext.state !== 'closed') void audioContext.close().catch(() => {});
            audioContext = null;
        };

        const frame = (now: number) => {
            if (disposed || !analyser || !buffer) return;

            const deltaSeconds = Math.min((now - lastFrameAt) / 1000, MAX_DELTA_SECONDS);
            lastFrameAt = now;
            const target = Math.min(1, getMicLevel(analyser, buffer));
            const timeConstant = Math.max(1, target > envelope ? ATTACK_MS : RELEASE_MS) / 1000;
            envelope += (target - envelope) * (1 - Math.exp(-deltaSeconds / timeConstant));

            if (!reduceMotion || now - lastDrawAt >= 1000 / 15) {
                const next = drawWave(canvas, history, envelope, color, tick, accumulator);
                tick = next.tick;
                accumulator = next.accumulator;
                lastDrawAt = now;
            }

            animationFrame = requestAnimationFrame(frame);
        };

        const start = async () => {
            const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
            if (disposed || document.hidden || opening || analyser) return;
            if (!AudioContextConstructor || !navigator.mediaDevices?.getUserMedia) {
                drawQuietWave(canvas, color);
                return;
            }

            opening = true;
            const currentAttempt = ++attemptId;
            let context: AudioContext | null = null;

            try {
                context = new AudioContextConstructor();
                audioContext = context;
                if (context.state === 'suspended') await context.resume();
                if (disposed || document.hidden || currentAttempt !== attemptId) return;
                const nextStream = await navigator.mediaDevices.getUserMedia({ audio: true });

                if (disposed || document.hidden || currentAttempt !== attemptId) {
                    nextStream.getTracks().forEach(track => track.stop());
                    return;
                }

                stream = nextStream;
                source = context.createMediaStreamSource(stream);
                analyser = context.createAnalyser();
                analyser.fftSize = FFT_SIZE;
                analyser.smoothingTimeConstant = 0;
                source.connect(analyser);
                buffer = new Uint8Array(analyser.frequencyBinCount);
                animationFrame = requestAnimationFrame(frame);
            } catch {
                if (!disposed && !document.hidden && currentAttempt === attemptId) {
                    releaseAudio();
                    drawQuietWave(canvas, color);
                }
            } finally {
                if (audioContext === context && (disposed || document.hidden || currentAttempt !== attemptId)) {
                    releaseAudio();
                }
                opening = false;
                if (!disposed && !document.hidden && !analyser && currentAttempt !== attemptId) void start();
            }
        };

        const stopForHiddenPage = () => {
            if (document.hidden) {
                attemptId += 1;
                releaseAudio();
                drawQuietWave(canvas, color);
                return;
            }
            void start();
        };

        drawQuietWave(canvas, color);
        document.addEventListener('visibilitychange', stopForHiddenPage);
        void start();

        return () => {
            disposed = true;
            attemptId += 1;
            document.removeEventListener('visibilitychange', stopForHiddenPage);
            releaseAudio();
            const context = canvas.getContext('2d');
            if (context) context.clearRect(0, 0, canvas.width, canvas.height);
        };
    }, [active, color]);

    return (
        <canvas
            ref={canvasRef}
            data-testid="voice-waveform"
            aria-hidden="true"
            className={className}
        />
    );
}
