'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';

export default function ImageViewer({ imageBase64, onClose }) {
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    
    const containerRef = useRef(null);
    const lastPosRef = useRef(null);
    const lastPinchDistRef = useRef(null);

    const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.5, 5));
    const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.5, 1));
    const handleFit = () => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
    };

    const handleWheel = (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.2 : 0.2;
        setZoom(prev => Math.min(Math.max(prev + delta, 1), 5));
    };

    const handlePointerDown = (e) => {
        setIsDragging(true);
        lastPosRef.current = { x: e.clientX, y: e.clientY };
    };

    const handlePointerMove = (e) => {
        if (!isDragging || zoom <= 1) return;
        
        const dx = e.clientX - lastPosRef.current.x;
        const dy = e.clientY - lastPosRef.current.y;
        
        setPan(prev => ({
            x: prev.x + dx,
            y: prev.y + dy
        }));
        
        lastPosRef.current = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = () => {
        setIsDragging(false);
        lastPosRef.current = null;
    };

    // Touch event handlers for pinch to zoom
    const handleTouchStart = (e) => {
        if (e.touches.length === 2) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            lastPinchDistRef.current = dist;
        }
    };

    const handleTouchMove = (e) => {
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
            const preventDefault = (e) => e.preventDefault();
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
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90 text-white backdrop-blur-sm">
            {/* Header */}
            <div className="flex items-center justify-between p-4 bg-black/50 border-b border-white/10 z-10">
                <h2 className="text-lg font-medium">ภาพที่ถ่าย</h2>
                <button 
                    onClick={onClose}
                    className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                    aria-label="ปิด"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Main Image Container */}
            <div 
                ref={containerRef}
                className="flex-1 relative overflow-hidden flex items-center justify-center cursor-move"
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
                    alt="Captured from blind user" 
                    className="max-h-full max-w-full object-contain transition-transform duration-100 ease-out"
                    style={{ 
                        transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                        transformOrigin: 'center center'
                    }}
                    draggable={false}
                />
            </div>

            {/* Footer Controls */}
            <div className="flex items-center justify-center gap-4 p-4 bg-black/50 border-t border-white/10 z-10">
                <span className="text-sm text-gray-300 w-16 text-right">
                    {Math.round(zoom * 100)}%
                </span>
                <button 
                    onClick={handleZoomOut}
                    className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                    disabled={zoom <= 1}
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                    </svg>
                </button>
                <button 
                    onClick={handleFit}
                    className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors font-medium text-sm"
                >
                    Fit
                </button>
                <button 
                    onClick={handleZoomIn}
                    className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                    disabled={zoom >= 5}
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                </button>
            </div>
        </div>
    );
}
