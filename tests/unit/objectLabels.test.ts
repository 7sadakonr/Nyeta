import { describe, expect, it } from 'vitest';
import { getObjectLabel } from '@/features/blind-assistant/client/objectLabels';

describe('object labels', () => {
    it('translates COCO-SSD class names to Thai', () => {
        expect(getObjectLabel('person')).toBe('คน');
        expect(getObjectLabel('cell phone')).toBe('โทรศัพท์มือถือ');
        expect(getObjectLabel('traffic light')).toBe('สัญญาณไฟจราจร');
    });

    it('keeps an unknown class name visible', () => {
        expect(getObjectLabel('unknown-object')).toBe('unknown-object');
    });
});
