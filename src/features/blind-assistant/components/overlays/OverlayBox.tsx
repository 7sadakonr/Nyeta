import React from 'react';
import { OverlayRect } from '@/features/blind-assistant/client/videoCoords';

export interface OverlayBoxProps {
    style: OverlayRect | { left: number; top: number; width: number; height: number } | null;
    color: string;
    dashed?: boolean;
    label?: string;
    thick?: boolean;
    pulse?: boolean;
}

export default function OverlayBox({ style, color, dashed, label, thick, pulse }: OverlayBoxProps) {
    if (!style) return null;
    
    return (
        <div
            className={`absolute box-border pointer-events-none ${pulse ? 'motion-safe:animate-pulse motion-reduce:animate-none' : ''}`}
            style={{
                left: `${style.left}%`,
                top: `${style.top}%`,
                width: `${style.width}%`,
                height: `${style.height}%`,
                border: `${thick ? 3 : 2}px ${dashed ? 'dashed' : 'solid'} ${color}`,
                borderRadius: dashed ? 4 : 2,
                boxShadow: `0 4px 12px ${color}55`,
            }}
        >
            {label && (
                <span
                    className="absolute -top-6 left-0 px-2 py-0.5 text-xs font-bold rounded whitespace-nowrap"
                    style={{ backgroundColor: `${color}cc`, color: '#000' }}
                >
                    {label}
                </span>
            )}
        </div>
    );
}
