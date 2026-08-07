import '@testing-library/jest-dom';

// Polyfills and mocks for Web APIs in JSDOM environment
if (typeof window !== 'undefined') {
    window.HTMLMediaElement.prototype.play = () => Promise.resolve();
    window.HTMLMediaElement.prototype.pause = () => {};
    window.HTMLMediaElement.prototype.load = () => {};
}
