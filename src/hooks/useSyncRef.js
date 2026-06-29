import { useRef, useEffect } from 'react';

export function useSyncRef(value) {
    const ref = useRef(value);
    useEffect(() => {
        ref.current = value;
    }, [value]);
    return ref;
}
