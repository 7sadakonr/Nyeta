import React from 'react';
import { BlindMode, AssistantStatus } from '@/features/blind-assistant/types/assistant';
import { CapturedCurrency } from '@/features/blind-assistant/hooks/useCurrencyScanner';

export interface ControlBarProps {
    mode: BlindMode;
    aiReady: boolean;
    aiStatus: AssistantStatus;
    isSpeaking: boolean;
    isListening: boolean;
    docText: string | null;
    isReading: boolean;
    isProcessingDoc: boolean;
    currencyResult: CapturedCurrency | null;
    currencyScanning: boolean;
    currencyMonitoring: boolean;
    totalAmount?: number;
    scannedCount?: number;
    isBlocked?: boolean;
    readerAligned: boolean;
    onCapture: () => void;
    onStopSpeaking: () => void;
    onStartListening: () => void;
    onStopListening: () => void;
    onCurrencyCapture: () => void;
    onShowCurrencyDetails: () => void;
    onReplayTotal: () => void;
    onClearTotal: () => void;
    onReadDocument: () => void;
    onReplayDocument: () => void;
    onStopReading: () => void;
}

interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    tone?: 'primary' | 'secondary' | 'danger';
    wide?: boolean;
}

function ActionButton({ tone = 'secondary', wide = false, className = '', children, ...props }: ActionButtonProps) {
    const toneClass = tone === 'primary'
        ? 'bg-[#3BA7FF] text-[#08111F] hover:bg-[#2A96EE]'
        : tone === 'danger'
            ? 'bg-[#3B1824] text-[#FFB2BA] hover:bg-[#54202D]'
            : 'border border-[#26364D] bg-[#16243A] text-[#F8FAFC] hover:bg-[#1D304A]';

    return (
        <button
            type="button"
            className={`${wide ? 'w-full' : 'min-w-0'} flex min-h-12 items-center justify-center rounded-xl px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${toneClass} ${className}`}
            {...props}
        >
            {children}
        </button>
    );
}

export default function ControlBar({
    mode,
    aiReady,
    aiStatus,
    isSpeaking,
    isListening,
    docText,
    isReading,
    isProcessingDoc,
    currencyResult,
    totalAmount = 0,
    scannedCount = 0,
    readerAligned,
    onCapture,
    onStopSpeaking,
    onStartListening,
    onStopListening,
    onShowCurrencyDetails,
    onReplayTotal,
    onClearTotal,
    onReadDocument,
    onReplayDocument,
    onStopReading,
}: ControlBarProps) {
    const isBusy = aiStatus === 'thinking';
    const canCapture = aiReady && !isBusy && !isListening;
    const canRead = aiReady && !isProcessingDoc && !isBusy;

    return (
        <div className="bg-[#08111F] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3" role="group" aria-label="ปุ่มควบคุม">
            {mode === 'assistant' && (
                <div className="mx-auto w-full max-w-xl space-y-3">
                    {isListening ? (
                        <ActionButton wide tone="danger" onClick={onStopListening} aria-label="หยุดและส่งคำถาม" aria-pressed="true">หยุดและส่ง</ActionButton>
                    ) : (
                        <ActionButton wide tone="primary" disabled={!canCapture} onClick={onCapture} aria-busy={isBusy} aria-label={isBusy ? 'AI กำลังคิด รอสักครู่' : 'บรรยายสิ่งที่เห็น'}>{isBusy ? 'กำลังประมวลผล...' : 'บรรยายสิ่งที่เห็น'}</ActionButton>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                        <ActionButton onClick={isListening ? onStopListening : onStartListening} aria-label={isListening ? 'กำลังฟัง กดอีกครั้งเพื่อหยุดและส่งคำถาม' : 'ถามด้วยเสียง'} aria-pressed={isListening}>{isListening ? 'กำลังฟัง...' : 'ถามด้วยเสียง'}</ActionButton>
                        <ActionButton tone="danger" disabled={!isSpeaking} onClick={onStopSpeaking} aria-label="หยุดเสียง">หยุดเสียง</ActionButton>
                    </div>
                </div>
            )}

            {mode === 'currency' && (
                <div className="mx-auto w-full max-w-xl space-y-3">
                    <ActionButton wide tone="primary" disabled={totalAmount === 0} onClick={onReplayTotal} aria-label={`ฟังยอดรวม ${totalAmount} บาท มี ${scannedCount} รายการ`}>ฟังยอดรวม</ActionButton>
                    <div className="grid grid-cols-2 gap-3">
                        <ActionButton disabled={!currencyResult} onClick={onShowCurrencyDetails} aria-label="รายละเอียดเงินล่าสุด">รายละเอียด</ActionButton>
                        <ActionButton tone="danger" disabled={totalAmount === 0} onClick={onClearTotal} aria-label={`ล้างยอดเงินสะสม ปัจจุบัน ${totalAmount} บาท`}>ล้างยอด</ActionButton>
                    </div>
                </div>
            )}

            {mode === 'reader' && (
                <div className="mx-auto w-full max-w-xl space-y-3">
                    <ActionButton wide tone="primary" disabled={!canRead} onClick={onReadDocument} aria-busy={isProcessingDoc || isBusy} aria-label={isProcessingDoc || isBusy ? 'กำลังอ่านเอกสาร รอสักครู่' : readerAligned ? 'อ่านเอกสาร' : 'ถ่ายหน้าเอกสารเพื่ออ่านออกเสียง'}>{isProcessingDoc || isBusy ? 'กำลังประมวลผล...' : 'อ่านเอกสาร'}</ActionButton>
                    <div className="grid grid-cols-2 gap-3">
                        <ActionButton disabled={!docText || isReading} onClick={onReplayDocument} aria-label="อ่านซ้ำเอกสาร">อ่านซ้ำ</ActionButton>
                        <ActionButton tone="danger" disabled={!isReading} onClick={onStopReading} aria-label="หยุดอ่านออกเสียง">หยุดอ่าน</ActionButton>
                    </div>
                </div>
            )}
        </div>
    );
}
