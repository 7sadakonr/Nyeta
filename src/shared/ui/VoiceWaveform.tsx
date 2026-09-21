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

const QUIET_HEIGHT = 0.1;
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

export default function VoiceWaveform({ active, color = '#FF453A', className = '' }: VoiceWaveformProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !active) return;

        let disposed = false;
        let animationFrame = 0;
        let tick = 0;
        let accumulator = 0;
        const history: number[] = [];
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

        const stopAnimation = () => {
            if (animationFrame) cancelAnimationFrame(animationFrame);
            animationFrame = 0;
        };

        const frame = (now: number) => {
            if (disposed || document.hidden) return;

            // SpeechRecognition owns microphone access. This is deliberately visual-only
            // so it cannot compete for a second audio stream on mobile browsers.
            const level = 0.32 + Math.sin(now / 130) * 0.16 + Math.sin(now / 53) * 0.06;
            const next = drawWave(canvas, history, Math.max(QUIET_HEIGHT, level), color, tick, accumulator);
            tick = next.tick;
            accumulator = next.accumulator;

            animationFrame = requestAnimationFrame(frame);
        };

        const startAnimation = () => {
            if (disposed || document.hidden || animationFrame || reduceMotion) return;
            animationFrame = requestAnimationFrame(frame);
        };

        const handleVisibilityChange = () => {
            if (document.hidden) {
                stopAnimation();
                drawQuietWave(canvas, color);
                return;
            }
            startAnimation();
        };

        drawQuietWave(canvas, color);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        startAnimation();

        return () => {
            disposed = true;
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            stopAnimation();
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
