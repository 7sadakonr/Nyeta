'use client';

import React, { useState, useRef, useEffect } from 'react';

export interface ImageViewerProps {
    imageBase64: string | null;
    onClose: () => void;
}

export default function ImageViewer({ imageBase64, onClose }: ImageViewerProps) {
    const [zoom, setZoom] = useState<number>(1);
    const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState<boolean>(false);
    
    const containerRef = useRef<HTMLDivElement | null>(null);
    const lastPosRef = useRef<{ x: number; y: number } | null>(null);
    const lastPinchDistRef = useRef<number | null>(null);

    const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.5, 5));
    const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.5, 1));
    const handleFit = () => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.2 : 0.2;
        setZoom(prev => Math.min(Math.max(prev + delta, 1), 5));
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        setIsDragging(true);
        lastPosRef.current = { x: e.clientX, y: e.clientY };
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging || zoom <= 1 || !lastPosRef.current) return;
        
        const dx = e.clientX - lastPosRef.current.x;
        const dy = e.clientY - lastPosRef.current.y;
        
        setPan(prev => ({
            x: prev.x + motionDelta(dx),
            y: prev.y + motionDelta(dy)
        }));
        
        lastPosRef.current = { x: e.clientX, y: e.clientY };
    };

    const motionDelta = (val: number) => val;

    const handlePointerUp = () => {
        setIsDragging(false);
        lastPosRef.current = null;
    };

    // Touch event handlers for pinch to zoom
    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            lastPinchDistRef.current = dist;
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (e.touches.length === 2 && lastPinchDistRef.current) {
            e.preventDefault();
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            
            const delta = (dist - lastPinchDistRef.current) * 0.01;
            setZoom(prev => Math.min(Math.max(prev + delta, 1), 5));
            lastPinchDistRef.current = dist;
        }
    };

    const handleTouchEnd = () => {
        lastPinchDistRef.current = null;
    };

    // Prevent default scrolling when hovering over image viewer
    useEffect(() => {
        const container = containerRef.current;
        if (container) {
            const preventDefault = (e: Event) => e.preventDefault();
            container.addEventListener('wheel', preventDefault, { passive: false });
            container.addEventListener('touchmove', preventDefault, { passive: false });
            
            return () => {
                container.removeEventListener('wheel', preventDefault);
                container.removeEventListener('touchmove', preventDefault);
            };
        }
    }, []);

    if (!imageBase64) return null;

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#090909]/95 text-white backdrop-blur-xl">
            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-[#121212]/80 border-b border-white/10 z-10 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-vol-accent" />
                    <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">ภาพนิ่งจากการถ่ายสด</h2>
                    <span className="text-xs text-zinc-400 hidden sm:inline">• ซูมและเลื่อนเพื่อดูรายละเอียด</span>
                </div>
                <button 
                    onClick={onClose}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white/10 hover:bg-white/20 active:scale-95 rounded-full text-xs font-semibold text-zinc-200 transition-colors border border-white/10"
                    aria-label="กลับไปที่กล้องสด"
                >
                    <svg className="w-4 h-4 text-vol-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span>กลับไปที่กล้องสด</span>
                </button>
            </div>

            {/* Main Image Container */}
            <div 
                ref={containerRef}
                className="flex-1 relative overflow-hidden flex items-center justify-center cursor-move select-none p-4"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onWheel={handleWheel}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                    src={imageBase64} 
                    alt="ภาพถ่ายจากกล้องสดของผู้ขอความช่วยเหลือ" 
                    className="max-h-full max-w-full object-contain transition-transform duration-100 ease-out shadow-2xl rounded-lg"
                    style={{ 
                        transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                        transformOrigin: 'center center'
                    }}
                    draggable={false}
                />
            </div>

            {/* Floating Footer Controls Dock */}
            <div className="shrink-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex items-center justify-center z-10">
                <div className="inline-flex items-center gap-2 sm:gap-3 px-4 py-2 bg-[#141414]/95 backdrop-blur-md border border-white/10 rounded-full shadow-2xl">
                    <button 
                        onClick={handleZoomOut}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.08] hover:bg-white/[0.15] active:scale-95 disabled:opacity-30 disabled:pointer-events-none text-white transition-all"
                        disabled={zoom <= 1}
                        aria-label="ซูมออก"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" />
                        </svg>
                    </button>
                    
                    <span className="text-xs sm:text-sm font-mono font-bold text-vol-accent min-w-[3.5rem] text-center">
                        {Math.round(zoom * 100)}%
                    </span>

                    <button 
                        onClick={handleZoomIn}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.08] hover:bg-white/[0.15] active:scale-95 disabled:opacity-30 disabled:pointer-events-none text-white transition-all"
                        disabled={zoom >= 5}
                        aria-label="ซูมเข้า"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                        </svg>
                    </button>

                    <div className="h-4 w-px bg-white/10 mx-0.5" />

                    <button 
                        onClick={handleFit}
                        className="px-3 py-1 rounded-full bg-white/[0.08] hover:bg-white/[0.15] active:scale-95 text-xs font-semibold text-zinc-300 transition-colors"
                        aria-label="ปรับภาพให้พอดีจอ"
                    >
                        พอดีจอ
                    </button>

                    <button 
                        onClick={onClose}
                        className="px-3.5 py-1 rounded-full bg-vol-accent hover:bg-vol-accent-hover active:scale-95 text-xs font-bold text-[#090909] transition-colors"
                        aria-label="ปิดดูภาพ"
                    >
                        ปิดภาพ
                    </button>
                </div>
            </div>
        </div>
    );
}
