import React, { KeyboardEvent, useRef } from 'react';
import { BlindMode } from '@/features/blind-assistant/types/assistant';

export interface ModeSwitcherProps {
    mode: BlindMode;
    switchMode: (mode: BlindMode) => void;
}

interface ModeItem {
    id: BlindMode;
    label: string;
}

const MODES: ModeItem[] = [
    { id: 'assistant', label: 'ผู้ช่วย' },
    { id: 'currency', label: 'เงิน' },
    { id: 'reader', label: 'เอกสาร' },
];

export default function ModeSwitcher({ mode, switchMode }: ModeSwitcherProps) {
    const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

    const activateAt = (index: number) => {
        const nextIndex = (index + MODES.length) % MODES.length;
        const nextMode = MODES[nextIndex];
        tabRefs.current[nextIndex]?.focus();
        switchMode(nextMode.id);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
        switch (event.key) {
            case 'ArrowRight':
            case 'ArrowDown':
                event.preventDefault();
                activateAt(index + 1);
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
                event.preventDefault();
                activateAt(index - 1);
                break;
            case 'Home':
                event.preventDefault();
                activateAt(0);
                break;
            case 'End':
                event.preventDefault();
                activateAt(MODES.length - 1);
                break;
        }
    };

    return (
        <div
            className="grid grid-cols-3 bg-[#0F1B2D] px-4 py-2"
            role="tablist"
        >
            {MODES.map((item, index) => (
                <button
                    key={item.id}
                    ref={(element) => { tabRefs.current[index] = element; }}
                    type="button"
                    role="tab"
                    id={`blind-mode-${item.id}-tab`}
                    aria-controls={mode === item.id ? `blind-mode-${item.id}-panel` : undefined}
                    aria-selected={mode === item.id}
                    tabIndex={mode === item.id ? 0 : -1}
                    onClick={() => switchMode(item.id)}
                    onKeyDown={(event) => handleKeyDown(event, index)}
                    className={`min-h-11 rounded-lg px-2 text-sm font-semibold transition-colors ${mode === item.id
                        ? 'bg-[#143A59] text-[#6FE8FF]'
                        : 'text-[#A8B3C5] hover:bg-[#16243A] hover:text-[#F8FAFC]'
                        }`}
                    aria-label={item.label}
                >
                    {item.label}
                </button>
            ))}
        </div>
    );
}
