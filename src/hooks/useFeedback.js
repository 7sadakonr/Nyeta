import { useCallback } from 'react';
import { playEarcon } from '@/lib/audio';

export function useFeedback(hapticRef) {
    const feedback = useCallback((type) => {
        if (type === 'capture') {
            playEarcon('capture');
            hapticRef.current?.trigger(1);
        } else if (type === 'success') {
            playEarcon('success');
            hapticRef.current?.trigger(2);
        } else if (type === 'error') {
            playEarcon('error');
            hapticRef.current?.trigger(3);
        } else if (type === 'ring') {
            playEarcon('ring');
            hapticRef.current?.startContinuous();
        } else if (type === 'connect') {
            playEarcon('connect');
            hapticRef.current?.trigger(3);
        } else if (type === 'end') {
            playEarcon('end');
            hapticRef.current?.trigger(1);
        }
    }, [hapticRef]);

    return { feedback };
}
