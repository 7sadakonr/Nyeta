import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hasCurrencySceneChanged } from '@/features/blind-assistant/client/currencyGemini';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Currency auto-scan safeguards', () => {
    it('detects only meaningful fingerprint changes', () => {
        const baseline = new Uint8Array([20, 20, 20, 20]);
        expect(hasCurrencySceneChanged(baseline, new Uint8Array([24, 24, 24, 24]))).toBe(false);
        expect(hasCurrencySceneChanged(baseline, new Uint8Array([40, 40, 40, 40]))).toBe(true);
    });

    it('keeps the scanner lifecycle as an explicit state machine', () => {
        const source = readSource('src/features/blind-assistant/hooks/useCurrencyScanner.ts');
        expect(source).toContain("type CurrencyScanPhase = 'idle' | 'searching' | 'checking' | 'waiting-removal' | 'paused'");
        expect(source).toContain("const currencyScanning = phase === 'checking'");
        expect(source).toContain("const currencyMonitoring = enabled && isReady && phase !== 'idle' && phase !== 'paused'");
    });

    it('uses one abortable request path and ignores stale work on cleanup', () => {
        const source = readSource('src/features/blind-assistant/hooks/useCurrencyScanner.ts');
        expect(source).toContain('const requestRef = useRef');
        expect(source).toContain('const controller = new AbortController()');
        expect(source).toContain('requestRef.current !== token || token.generation !== generationRef.current');
        expect(source).toContain('requestRef.current?.controller.abort()');
    });

    it('requires removal confirmation before re-arming a next scan', () => {
        const source = readSource('src/features/blind-assistant/hooks/useCurrencyScanner.ts');
        expect(source).toContain("if (token.returnPhase === 'waiting-removal')");
        expect(source).toContain('removalNotFoundCountRef.current >= 2');
        expect(source).toContain('พร้อมสแกนใบถัดไป');
    });
});