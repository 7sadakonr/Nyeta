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
        <div className="shrink-0 bg-[#F4F8FF] px-0">
            <div
                className="grid w-full grid-cols-3 rounded-none border-b border-[#DBE7F5] bg-[#F4F8FF]"
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
                        className={`min-h-12 rounded-none px-2 text-sm font-bold transition-[background-color,color,transform] active:scale-[0.98] ${mode === item.id
                            ? 'bg-[#EAF4FF] text-[#1D4ED8] shadow-sm'
                            : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A]'
                            }`}
                        aria-label={item.label}
                    >
                        {item.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
