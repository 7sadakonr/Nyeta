// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TopNavBar from '@/features/blind-assistant/components/TopNavBar';

describe('TopNavBar safe-area layout', () => {
    it('extends the dark header through the safe area without legacy route navigation', () => {
        render(
            <TopNavBar
                aiReady
                aiStatus="idle"
                mode="assistant"
                currencyScanning={false}
                currencyMonitoring={false}
                statusLabel="AI พร้อม"
            />,
        );

        const header = screen.getByRole('banner');
        expect(header.className).toContain('bg-black/80');
        expect(header.className).toContain('pt-[calc(env(safe-area-inset-top)+0.75rem)]');
        expect(screen.queryByRole('link', { name: 'กลับหน้าหลัก' })).toBeNull();
    });
});
