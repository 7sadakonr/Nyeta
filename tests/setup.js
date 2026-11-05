// Test setup file for unit testing environment
// Provide mock browser globals if needed in tests
if (typeof window !== 'undefined') {
    if (window.HTMLMediaElement) {
        window.HTMLMediaElement.prototype.play = () => Promise.resolve();
        window.HTMLMediaElement.prototype.pause = () => {};
        window.HTMLMediaElement.prototype.load = () => {};
    }
}

// Newer Node versions expose a native `localStorage` global that is undefined unless
// --localstorage-file is set, which shadows jsdom's. Fall back to an in-memory Storage.
if (typeof window !== 'undefined') {
    let storageOk = false;
    try { storageOk = !!window.localStorage && typeof window.localStorage.setItem === 'function'; } catch { storageOk = false; }
    if (!storageOk) {
        const createStorage = () => {
            const store = new Map();
            return {
                get length() { return store.size; },
                key: (index) => Array.from(store.keys())[index] ?? null,
                getItem: (key) => (store.has(String(key)) ? store.get(String(key)) : null),
                setItem: (key, value) => { store.set(String(key), String(value)); },
                removeItem: (key) => { store.delete(String(key)); },
                clear: () => { store.clear(); },
            };
        };
        Object.defineProperty(window, 'localStorage', { configurable: true, value: createStorage() });
        Object.defineProperty(window, 'sessionStorage', { configurable: true, value: createStorage() });
    }
}
